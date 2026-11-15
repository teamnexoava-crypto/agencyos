/**
 * The scheduled job (every 15 minutes, see `triggers` in wrangler.jsonc). It does two things nobody
 * else would do while the app is closed:
 *
 *  1. Billing check-ups – asks Razorpay / Dodo about workspaces with something pending (a charge due,
 *     a payment page still open, an auto-pay set-up not yet confirmed), so a payment is recorded and a
 *     failed one noticed even when no webhook arrives and nobody opens the app.
 *  2. Emails – welcome, the trial running out, the trial or a plan having ended, a plan without
 *     auto-pay about to end, and auto-pay failing or stopping. Each goes out once (see `emailLog`).
 */
import { and, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { AUTOPAY_GRACE_DAYS, RENEWAL_REMINDER_DAYS } from "../../shared/plans";
import type { BillingDTO } from "../../shared/types";
import type { Database } from "../db";
import { billingPayments, billingSubscriptions, emailLog, users, workspaceMembers, workspaces } from "../db/schema";
import { EmailError, isEmailConfigured, sendEmail } from "../lib/email";
import type { WorkspaceRow } from "../types";
import { billingOf, paymentsReady, reconcileBilling, usageOf } from "./billing";
import { renderEmail, type EmailContext, type EmailKind } from "./email-templates";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** At most this many emails per run, so one run never floods the provider. */
const MAX_EMAILS_PER_RUN = 40;
/** At most this many workspaces are checked with the payment providers per run. */
const MAX_BILLING_CHECKS_PER_RUN = 25;

export interface DueEmail {
  kind: EmailKind;
  /** What it is about, so the same email is never sent twice for the same thing (e.g. a trial end date). */
  key: string;
  date: Date | null;
}

/**
 * Which emails a workspace is due right now. Pure: it only looks at the workspace row and its billing
 * state, so it is easy to reason about – and the email log makes sure each is sent once.
 */
export function dueEmails(ws: WorkspaceRow, billing: BillingDTO, now: Date): DueEmail[] {
  if (ws.billingExempt) return [];
  const due: DueEmail[] = [];
  if (now.getTime() - ws.createdAt.getTime() < 2 * DAY_MS) due.push({ kind: "welcome", key: "1", date: null });
  // Nothing about trials or plans until payments are switched on for this workspace's currency.
  if (!billing.enabled) return due;

  const trialEnd = ws.trialEndsAt;
  const msLeft = (date: Date) => date.getTime() - now.getTime();
  const recentlyPast = (date: Date | null) => date !== null && date <= now && now.getTime() - date.getTime() < 3 * DAY_MS;

  if (billing.status === "trial") {
    const left = msLeft(trialEnd);
    if (ws.subscriptionId && (billing.autoPay === "on" || billing.autoPay === "retrying")) {
      if (left <= 50 * HOUR_MS) due.push({ kind: "autopay_upcoming", key: String(trialEnd.getTime()), date: trialEnd });
    } else if (left <= DAY_MS) {
      due.push({ kind: "trial_1d", key: String(trialEnd.getTime()), date: trialEnd });
    } else if (left <= 50 * HOUR_MS) {
      due.push({ kind: "trial_2d", key: String(trialEnd.getTime()), date: trialEnd });
    }
  }

  if (billing.status === "free") {
    if (ws.plan === null && recentlyPast(trialEnd)) due.push({ kind: "trial_ended", key: String(trialEnd.getTime()), date: trialEnd });
    // A paid plan ends at its paid-until date (plus the grace days while auto-pay was still retrying).
    if (ws.plan !== null && ws.paidUntil && (recentlyPast(ws.paidUntil) || recentlyPast(new Date(ws.paidUntil.getTime() + AUTOPAY_GRACE_DAYS * DAY_MS)))) {
      due.push({ kind: "plan_ended", key: String(ws.paidUntil.getTime()), date: ws.paidUntil });
    }
  }

  if (billing.status === "active" && ws.paidUntil) {
    const mandate = ws.subscriptionId ? `${ws.subscriptionId}:${ws.paidUntil.getTime()}` : null;
    if (billing.autoPay === "retrying" && mandate) due.push({ kind: "payment_failed", key: mandate, date: ws.paidUntil });
    else if (billing.autoPay === "stopped" && mandate) due.push({ kind: "autopay_stopped", key: mandate, date: ws.paidUntil });
    else if (!ws.subscriptionId && msLeft(ws.paidUntil) <= RENEWAL_REMINDER_DAYS * DAY_MS) due.push({ kind: "plan_ending", key: String(ws.paidUntil.getTime()), date: ws.paidUntil });
  }
  return due;
}

export interface JobSummary {
  billingChecked: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: "not_configured" | null;
}

const appUrlOf = (env: Env) => (env.APP_URL?.trim() || "https://growupliftos.com").replace(/\/+$/, "");

/** Workspaces with something waiting on a payment provider. */
async function billingCheckups(db: Database, env: Env, now: Date): Promise<number> {
  // Dates inside raw SQL go in as ISO strings (a Date there is not converted for us).
  const recent = sql`${new Date(now.getTime() - 2 * DAY_MS).toISOString()}::timestamptz`;
  const rows = await db
    .select({ id: workspaces.id, currency: workspaces.billingCurrency })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.billingExempt, false),
        isNull(workspaces.deletedAt),
        or(
          // Auto-pay with a charge due (or overdue), not looked at in the last half hour.
          and(
            isNotNull(workspaces.subscriptionId),
            sql`coalesce(${workspaces.paidUntil}, ${workspaces.trialEndsAt}) < ${new Date(now.getTime() + HOUR_MS).toISOString()}::timestamptz`,
            or(isNull(workspaces.subscriptionSyncedAt), lt(workspaces.subscriptionSyncedAt, new Date(now.getTime() - 30 * 60_000))),
          ),
          // A payment page or an auto-pay set-up opened recently and not settled yet.
          sql`exists (select 1 from ${billingPayments} where ${billingPayments.workspaceId} = ${workspaces.id} and ${billingPayments.status} = 'created' and ${billingPayments.providerLinkId} is not null and ${billingPayments.createdAt} > ${recent})`,
          sql`exists (select 1 from ${billingSubscriptions} where ${billingSubscriptions.workspaceId} = ${workspaces.id} and ${billingSubscriptions.status} = 'created' and ${billingSubscriptions.createdAt} > ${recent})`,
        ),
      ),
    )
    .limit(MAX_BILLING_CHECKS_PER_RUN);
  let checked = 0;
  for (const row of rows) {
    if (!paymentsReady(env, row.currency)) continue;
    try {
      await reconcileBilling(db, env, row.id, { timeoutMs: 8_000 });
      checked += 1;
    } catch (error) {
      console.error("Scheduled billing check failed", { workspaceId: row.id, error });
    }
  }
  return checked;
}

/** Sends one email unless it was sent before. Returns whether it went out. */
async function sendOnce(db: Database, env: Env, ws: WorkspaceRow, owner: { email: string; name: string }, due: DueEmail, now: Date): Promise<boolean> {
  const [claimed] = await db
    .insert(emailLog)
    .values({ workspaceId: ws.id, kind: due.kind, key: due.key, toEmail: owner.email })
    .onConflictDoNothing()
    .returning({ id: emailLog.id });
  if (!claimed) return false;

  try {
    const context: EmailContext = {
      firstName: owner.name.trim().split(/\s+/)[0] || "there",
      workspaceName: ws.name,
      appUrl: appUrlOf(env),
      currency: ws.billingCurrency,
      plan: ws.plan,
      date: due.date,
    };
    if (due.kind === "autopay_upcoming" || due.kind === "payment_failed") {
      const [mandate] = ws.subscriptionId
        ? await db.select({ plan: billingSubscriptions.plan, amount: billingSubscriptions.amount }).from(billingSubscriptions).where(eq(billingSubscriptions.id, ws.subscriptionId)).limit(1)
        : [];
      if (mandate) Object.assign(context, { plan: mandate.plan, amount: mandate.amount });
    }
    if (due.kind === "trial_2d" || due.kind === "trial_ended") context.usage = await usageOf(db, ws.id, now);
    const email = renderEmail(due.kind, context);
    const providerId = await sendEmail(env, { ...email, to: owner.email, idempotencyKey: `${ws.id}:${due.kind}:${due.key}`, tags: [{ name: "kind", value: due.kind }] });
    await db.update(emailLog).set({ providerId }).where(eq(emailLog.id, claimed.id));
    return true;
  } catch (error) {
    // Not sent: release the claim so the next run tries again (the provider's idempotency key stops a
    // double send if it had in fact gone through).
    await db.delete(emailLog).where(eq(emailLog.id, claimed.id));
    console.error("Could not send an email", { workspaceId: ws.id, kind: due.kind, status: error instanceof EmailError ? error.status : null, error: String(error) });
    throw error;
  }
}

/** Workspaces that could be due an email: new ones, and those near a trial or plan date, or with auto-pay trouble. */
async function emailCandidates(db: Database, now: Date): Promise<WorkspaceRow[]> {
  const back = new Date(now.getTime() - 3 * DAY_MS - AUTOPAY_GRACE_DAYS * DAY_MS);
  return db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.billingExempt, false),
        isNull(workspaces.deletedAt),
        or(
          gt(workspaces.createdAt, new Date(now.getTime() - 2 * DAY_MS)),
          and(gt(workspaces.trialEndsAt, back), lt(workspaces.trialEndsAt, new Date(now.getTime() + 50 * HOUR_MS))),
          and(gt(workspaces.paidUntil, back), lt(workspaces.paidUntil, new Date(now.getTime() + RENEWAL_REMINDER_DAYS * DAY_MS + HOUR_MS))),
          inArray(workspaces.subscriptionStatus, ["pending", "halted", "paused"]),
        ),
      ),
    )
    .limit(300);
}

async function sendDueEmails(db: Database, env: Env, now: Date): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const ws of await emailCandidates(db, now)) {
    if (sent + failed >= MAX_EMAILS_PER_RUN) break;
    const due = dueEmails(ws, billingOf(env, ws, now), now);
    if (!due.length) continue;
    const [owner] = await db
      .select({ email: users.email, name: users.name })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.role, "owner"), isNull(workspaceMembers.removedAt)))
      .orderBy(workspaceMembers.createdAt)
      .limit(1);
    if (!owner) continue;
    for (const item of due) {
      try {
        if (await sendOnce(db, env, ws, owner, item, now)) sent += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { sent, failed };
}

/** Everything the scheduled trigger does. Safe to run as often as anyone likes. */
export async function runScheduledJobs(db: Database, env: Env, now = new Date()): Promise<JobSummary> {
  const billingChecked = await billingCheckups(db, env, now);
  if (!isEmailConfigured(env)) return { billingChecked, emailsSent: 0, emailsFailed: 0, emailsSkipped: "not_configured" };
  const { sent, failed } = await sendDueEmails(db, env, now);
  return { billingChecked, emailsSent: sent, emailsFailed: failed, emailsSkipped: null };
}
