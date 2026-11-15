import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { APP_NAME } from "../../shared/constants";
import {
  ALL_FEATURES,
  AUTOPAY_GRACE_DAYS,
  FEATURE_NAMES,
  NO_LIMITS,
  PLANS,
  TIERS,
  TRIAL_DAYS,
  TRIAL_PLAN,
  addMonths,
  autoPayStateOf,
  isSubscriptionOver,
  nextPaidPeriod,
  paidTimeFor,
  type BillingCurrency,
  type BillingCycle,
  type BillingPaymentStatus,
  type PlanFeature,
  type PlanId,
  type SubscriptionStatus,
  type TierId,
} from "../../shared/plans";
import type { AutoPayDTO, BillingDTO, BillingPaymentDTO, BillingUsage, PendingSetupDTO } from "../../shared/types";
import type { Database } from "../db";
import type { PgColumn } from "drizzle-orm/pg-core";
import { appFlags, billingPayments, billingProviderPlans, billingSubscriptions, clients, contracts, files, invites, invoices, leadSources, leads, projects, workspaceMembers, workspaces } from "../db/schema";
import { ApiError } from "../lib/errors";
import {
  RazorpayError,
  cancelProviderSubscription,
  createProviderPlan,
  fetchPaymentLink,
  fetchSubscription,
  isBillingConfigured,
  type ProviderSubscription,
} from "../lib/razorpay";
import type { Tenant } from "../lib/tenant";
import type { WorkspaceRow } from "../types";

const DAY_MS = 86_400_000;
const GRACE_MS = AUTOPAY_GRACE_DAYS * DAY_MS;
const daysUntil = (end: Date, now: Date) => Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
const later = (a: Date | null, b: Date) => (a && a > b ? a : b);
const fromUnix = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);

/**
 * Where a workspace stands right now. Pure and cheap: it is worked out from the workspace row on
 * every request, so there is no scheduled job that has to "expire" anyone.
 */
export function billingOf(env: Env, ws: WorkspaceRow, now = new Date()): BillingDTO {
  const autoPay = autoPayStateOf(ws.subscriptionId ? ws.subscriptionStatus : null);
  const base = { plan: ws.plan, currency: ws.billingCurrency, trialEndsAt: ws.trialEndsAt.getTime(), paidUntil: ws.paidUntil?.getTime() ?? null };
  const unlimited = { tier: TRIAL_PLAN, limits: NO_LIMITS, features: ALL_FEATURES } as const;
  if (!isBillingConfigured(env)) return { ...base, enabled: false, status: "open", daysLeft: null, autoPay: null, ...unlimited };
  if (ws.billingExempt) return { ...base, enabled: true, status: "exempt", daysLeft: null, autoPay: null, ...unlimited };
  const on = (tier: TierId) => ({ tier, limits: TIERS[tier].limits, features: TIERS[tier].features });
  // An auto-pay charge is taken on the day the covered time ends and may land a little later (and a
  // failed one is retried), so the workspace keeps what it has for a few days past that date.
  const grace = autoPay === "on" || autoPay === "retrying" ? GRACE_MS : 0;
  if (ws.plan && ws.paidUntil && ws.paidUntil.getTime() + grace > now.getTime()) {
    return { ...base, enabled: true, status: "active", daysLeft: daysUntil(ws.paidUntil, now), autoPay, ...on(ws.plan) };
  }
  // A mandate approved during the trial takes its first payment the day the trial ends; until that
  // payment arrives nothing has been paid, so the workspace is simply still on its trial.
  if (!ws.plan && ws.trialEndsAt.getTime() + grace > now.getTime()) {
    return { ...base, enabled: true, status: "trial", daysLeft: daysUntil(ws.trialEndsAt, now), autoPay, ...on(TRIAL_PLAN) };
  }
  // The trial is over, or the paid plan has run out: the Free tier. Nothing is locked away or lost.
  return { ...base, enabled: true, status: "free", daysLeft: null, autoPay, ...on("free") };
}

/**
 * What an auto-pay set-up is priced on: the plan, the time paid for and the mandate in place when it
 * was created. If any of that has changed by the time the payer approves it (they paid another way in
 * the meantime, say), its start date and plan no longer fit and it must not be used.
 */
export const basisOf = (ws: WorkspaceRow): string => `${ws.plan ?? ""}|${ws.paidUntil?.getTime() ?? ""}|${ws.subscriptionId ?? ""}`;

/** A set-up still fits if plan and paid time are as they were; the old mandate may be the same one or already stopped. */
export function isSetupFresh(basis: string | null, ws: WorkspaceRow): boolean {
  if (basis === null) return true;
  const [plan, paidUntil, mandate] = basis.split("|");
  return plan === (ws.plan ?? "") && paidUntil === String(ws.paidUntil?.getTime() ?? "") && (ws.subscriptionId === null || ws.subscriptionId === mandate);
}

/**
 * The Free tier is for one person. Once a workspace is on it, anyone other than the owner is asked to
 * wait until the owner upgrades – `tenant()` throws this for them.
 */
export const seatRequired = (ws: WorkspaceRow) => new ApiError(402, "plan_seat", `${ws.name} is on the Free plan, which is for one person. Ask the owner to upgrade so the team can get back in.`);

/* ------------------------------------------------------------------------------------------------
 * Plan limits and features
 * ---------------------------------------------------------------------------------------------- */

const upgradeTo = (tier: TierId) => (tier === "free" ? "Upgrade in Billing to get more." : "Upgrade to Premium in Billing for no limits.");
const tierLabel = (billing: BillingDTO) => (billing.status === "trial" ? "The free trial" : `The ${TIERS[billing.tier].name} plan`);
const limitReached = (billing: BillingDTO, what: string) => new ApiError(403, "plan_limit", `${tierLabel(billing)} includes ${what}. ${upgradeTo(billing.tier)}`);

const startOfMonthUtc = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const ACTIVE_PROJECT = notInArray(projects.status, ["completed", "cancelled"]);

/** Whole features that the workspace's tier switches off (contracts, the client portal, finance). */
export function assertFeature(t: Tenant, env: Env, feature: PlanFeature): void {
  if (!billingOf(env, t.workspace).features[feature]) {
    const plural = feature !== "portal";
    throw new ApiError(403, "plan_feature", `${FEATURE_NAMES[feature]} ${plural ? "are" : "is"} part of the Growth and Premium plans. Upgrade in Billing to use ${plural ? "them" : "it"}.`);
  }
}

/** The same question for a workspace reached without a session (public links). */
export const hasFeature = (env: Env, ws: WorkspaceRow, feature: PlanFeature): boolean => billingOf(env, ws).features[feature];

export async function usageOf(db: Database, workspaceId: string, now = new Date()): Promise<BillingUsage> {
  const mine = <T extends { workspaceId: PgColumn }>(table: T) => eq(table.workspaceId, workspaceId);
  const [members, openInvites, activeProjects, clientCount, invoicesThisMonth, leadCount, sheets, contractsThisMonth, storage] = await Promise.all([
    db.$count(workspaceMembers, and(mine(workspaceMembers), isNull(workspaceMembers.removedAt))),
    db.$count(invites, and(mine(invites), isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now))),
    db.$count(projects, and(mine(projects), isNull(projects.deletedAt), ACTIVE_PROJECT)),
    db.$count(clients, and(mine(clients), isNull(clients.deletedAt))),
    // Deleted invoices and contracts still count, so a monthly allowance can't be reset by deleting and recreating.
    db.$count(invoices, and(mine(invoices), gte(invoices.createdAt, startOfMonthUtc(now)))),
    db.$count(leads, and(mine(leads), isNull(leads.deletedAt))),
    db.$count(leadSources, and(mine(leadSources), isNull(leadSources.deletedAt))),
    db.$count(contracts, and(mine(contracts), gte(contracts.createdAt, startOfMonthUtc(now)))),
    db
      .select({ bytes: sql<string>`coalesce(sum(${files.size}), 0)` })
      .from(files)
      .where(and(mine(files), isNull(files.deletedAt))),
  ]);
  return { members: members + openInvites, activeProjects, clients: clientCount, invoicesThisMonth, leads: leadCount, sheets, contractsThisMonth, storageBytes: Number(storage[0]?.bytes ?? 0) };
}

/** A seat is needed for every member and for every invitation that is still open. */
export async function assertSeatAvailable(t: Tenant, env: Env, replacingInviteFor?: string): Promise<void> {
  const billing = billingOf(env, t.workspace);
  const limit = billing.limits.members;
  if (limit === null) return;
  if (limit <= 1) throw new ApiError(403, "plan_feature", "Team members are part of the Growth and Premium plans. Upgrade in Billing to invite your team.");
  const now = new Date();
  const [members, openInvites] = await Promise.all([
    t.db.$count(workspaceMembers, t.where(workspaceMembers, isNull(workspaceMembers.removedAt))),
    t.db.$count(
      invites,
      t.where(invites, isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now), replacingInviteFor ? ne(invites.email, replacingInviteFor) : undefined),
    ),
  ]);
  if (members + openInvites >= limit) throw limitReached(billing, `${limit} people, counting invitations that are still open`);
}

/** Checked again when an invitation is accepted, in case the plan changed after it was sent. */
export async function hasSeatFor(db: Database, env: Env, ws: WorkspaceRow): Promise<boolean> {
  const limit = billingOf(env, ws).limits.members;
  if (limit === null) return true;
  return (await db.$count(workspaceMembers, and(eq(workspaceMembers.workspaceId, ws.id), isNull(workspaceMembers.removedAt)))) < limit;
}

export async function assertProjectAvailable(t: Tenant, env: Env): Promise<void> {
  const billing = billingOf(env, t.workspace);
  const limit = billing.limits.activeProjects;
  if (limit === null) return;
  if ((await t.db.$count(projects, t.where(projects, isNull(projects.deletedAt), ACTIVE_PROJECT))) >= limit) {
    throw limitReached(billing, `${limit} active projects – complete or delete one to start another`);
  }
}

export async function assertClientAvailable(t: Tenant, env: Env): Promise<void> {
  const billing = billingOf(env, t.workspace);
  const limit = billing.limits.clients;
  if (limit === null) return;
  if ((await t.db.$count(clients, t.where(clients, isNull(clients.deletedAt)))) >= limit) throw limitReached(billing, `${limit} clients`);
}

export async function assertInvoiceAvailable(t: Tenant, env: Env): Promise<void> {
  const billing = billingOf(env, t.workspace);
  const limit = billing.limits.invoicesPerMonth;
  if (limit === null) return;
  if ((await t.db.$count(invoices, t.where(invoices, gte(invoices.createdAt, startOfMonthUtc())))) >= limit) {
    throw limitReached(billing, `${limit} invoices a month, and this month's are used up`);
  }
}

export async function assertLeadAvailable(t: Tenant, env: Env): Promise<void> {
  const billing = billingOf(env, t.workspace);
  const limit = billing.limits.leads;
  if (limit === null) return;
  if ((await t.db.$count(leads, t.where(leads, isNull(leads.deletedAt)))) >= limit) throw limitReached(billing, `${limit} leads`);
}

/** `connecting` = a new sheet is being added; otherwise the question is only whether sheet sync is on at all. */
export async function assertSheetAvailable(t: Tenant, env: Env, connecting = true): Promise<void> {
  const billing = billingOf(env, t.workspace);
  const limit = billing.limits.sheets;
  if (limit === null) return;
  if (limit === 0) throw new ApiError(403, "plan_feature", "Google Sheet sync is part of the Growth and Premium plans. Upgrade in Billing to use it.");
  if (connecting && (await t.db.$count(leadSources, t.where(leadSources, isNull(leadSources.deletedAt)))) >= limit) {
    throw limitReached(billing, `${limit} connected Google Sheet${limit === 1 ? "" : "s"}`);
  }
}

export async function assertContractAvailable(t: Tenant, env: Env): Promise<void> {
  assertFeature(t, env, "contracts");
  const billing = billingOf(env, t.workspace);
  const limit = billing.limits.contractsPerMonth;
  if (limit === null) return;
  if ((await t.db.$count(contracts, t.where(contracts, gte(contracts.createdAt, startOfMonthUtc())))) >= limit) {
    throw limitReached(billing, `${limit} contracts a month, and this month's are used up`);
  }
}

export async function assertStorageAvailable(t: Tenant, env: Env, addingBytes: number): Promise<void> {
  const billing = billingOf(env, t.workspace);
  const limit = billing.limits.storageBytes;
  if (limit === null) return;
  const [row] = await t.db
    .select({ bytes: sql<string>`coalesce(sum(${files.size}), 0)` })
    .from(files)
    .where(t.where(files, isNull(files.deletedAt)));
  if (Number(row?.bytes ?? 0) + addingBytes > limit) {
    throw limitReached(billing, `${limit >= 1024 ** 3 ? `${Math.round(limit / 1024 ** 3)} GB` : `${Math.round(limit / 1024 ** 2)} MB`} of file storage, and it is full`);
  }
}

/* ------------------------------------------------------------------------------------------------
 * One-off payments
 * ---------------------------------------------------------------------------------------------- */

type PaymentRow = typeof billingPayments.$inferSelect;
type SubscriptionRow = typeof billingSubscriptions.$inferSelect;

export const toPaymentDTO = (row: PaymentRow): BillingPaymentDTO => ({
  id: row.id,
  plan: row.plan,
  cycle: row.cycle,
  amount: row.amount,
  currency: row.currency,
  status: row.status,
  createdAt: row.createdAt.getTime(),
  paidAt: row.paidAt?.getTime() ?? null,
  periodStart: row.periodStart?.getTime() ?? null,
  periodEnd: row.periodEnd?.getTime() ?? null,
  paidBy: row.createdByName,
  autoPay: row.subscriptionId !== null,
});

/**
 * Brings one payment up to date with Razorpay and, if it has been paid, starts the plan.
 *
 * Nothing sent by the browser is trusted here: the payment link is read back from Razorpay with our
 * own keys, and only "paid, in full, in the right currency, for this reference" counts. It is safe to
 * call any number of times (redirect, webhook and page load can all arrive for the same payment):
 * the row is locked and a payment that is already settled is left alone.
 */
export async function settlePayment(db: Database, env: Env, paymentId: string, options: { timeoutMs?: number } = {}): Promise<BillingPaymentStatus> {
  const [payment] = await db.select().from(billingPayments).where(eq(billingPayments.id, paymentId)).limit(1);
  if (!payment) return "failed";
  if (payment.status !== "created" || !payment.providerLinkId) return payment.status;

  const link = await fetchPaymentLink(env, payment.providerLinkId, options.timeoutMs);
  const paidInFull = link.status === "paid" && link.amount_paid >= payment.amount && link.currency === payment.currency && link.reference_id === payment.id;

  if (!paidInFull) {
    if (link.status !== "expired" && link.status !== "cancelled") return "created";
    const closed: BillingPaymentStatus = link.status === "expired" ? "expired" : "failed";
    await db
      .update(billingPayments)
      .set({ status: closed })
      .where(and(eq(billingPayments.id, payment.id), eq(billingPayments.status, "created")));
    return closed;
  }

  // Paying for a period in one go replaces auto-pay: stop the mandate first, so nobody is charged for
  // time they have just paid for. If that fails, nothing is settled and the whole step is tried again
  // on the next redirect, webhook or look at the billing screen.
  const [before] = await db.select({ subscriptionId: workspaces.subscriptionId }).from(workspaces).where(eq(workspaces.id, payment.workspaceId)).limit(1);
  if (before?.subscriptionId) await cancelSubscription(db, env, before.subscriptionId);

  const providerPaymentId = link.payments?.find((item) => item.status === "captured")?.payment_id ?? link.payments?.[0]?.payment_id ?? null;
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(billingPayments).where(eq(billingPayments.id, payment.id)).for("update");
    if (!locked || locked.status !== "created") return;
    const [ws] = await tx.select().from(workspaces).where(eq(workspaces.id, locked.workspaceId)).for("update");
    if (!ws) return;
    // A mandate became live between the check above and this lock: back out and come round again.
    if (ws.subscriptionId) throw new ApiError(409, "conflict", "Auto-pay changed while this payment was being confirmed.");

    const now = new Date();
    const period = nextPaidPeriod(
      { plan: ws.plan, paidUntil: ws.paidUntil, trialEndsAt: ws.trialEndsAt, billingCurrency: ws.billingCurrency },
      { plan: locked.plan, cycle: locked.cycle },
      now,
    );
    await tx.update(workspaces).set({ plan: locked.plan, paidUntil: period.end }).where(eq(workspaces.id, ws.id));
    await tx
      .update(billingPayments)
      .set({ status: "paid", paidAt: now, periodStart: period.start, periodEnd: period.end, providerPaymentId })
      .where(eq(billingPayments.id, locked.id));
  });
  // Any auto-pay set-up still waiting to be approved was priced on the old state: withdraw it.
  await cancelPendingSetups(db, env, payment.workspaceId);
  return "paid";
}

/* ------------------------------------------------------------------------------------------------
 * Auto-pay (Razorpay subscriptions)
 * ---------------------------------------------------------------------------------------------- */

/** The Razorpay plan (a fixed amount per month) for one of ours, created the first time it is needed. */
export async function ensureProviderPlan(db: Database, env: Env, plan: PlanId, cycle: BillingCycle, amount: number, currency: BillingCurrency): Promise<string> {
  // Test and live keys have separate plans, and a plan's price can never change, so both are part of
  // the key (rupee plans keep the key they had before dollar prices existed).
  const key = `${env.RAZORPAY_KEY_ID?.trim()}:${plan}:${cycle}:${currency === "INR" ? "" : `${currency}:`}${amount}`;
  const [known] = await db.select().from(billingProviderPlans).where(eq(billingProviderPlans.key, key)).limit(1);
  if (known) return known.providerPlanId;

  const providerPlanId = await createProviderPlan(env, { name: `${APP_NAME} ${PLANS[plan].name} – ${cycle}`, amount, currency, period: cycle });
  await db.insert(billingProviderPlans).values({ key, providerPlanId }).onConflictDoNothing();
  const [stored] = await db.select().from(billingProviderPlans).where(eq(billingProviderPlans.key, key)).limit(1);
  return stored?.providerPlanId ?? providerPlanId;
}

/**
 * Razorpay reports the mandate as approved by the payer, now or at some point before. A subscription
 * can only be retrying, halted, paused or completed after it was approved, so those count too – it may
 * be a long time between the approval and the first time we get to look.
 */
const isApproved = (entity: ProviderSubscription) => (entity.status !== "created" && entity.status !== "expired" && entity.status !== "cancelled") || (entity.paid_count ?? 0) > 0;

/**
 * Writes what Razorpay says about one subscription into our records, in one transaction:
 *  - the first time the mandate is approved it becomes the workspace's auto-pay (`promote`), provided
 *    the workspace is still as it was when the set-up was priced;
 *  - every charge not yet counted is turned into paid time and a row in the payment history. Each
 *    charge has a number, so none is ever counted twice – and none is ever dropped: money taken by a
 *    mandate that is not (or no longer) the workspace's auto-pay still buys time on its current plan;
 *  - once Razorpay says the subscription is over, the workspace is detached from it. The plan and
 *    the time already paid for stay.
 */
async function applySubscription(db: Database, subscriptionId: string, entity: ProviderSubscription, options: { promote: boolean; paymentId?: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [sub] = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscriptionId)).for("update");
    if (!sub) return;
    const [ws] = await tx.select().from(workspaces).where(eq(workspaces.id, sub.workspaceId)).for("update");
    if (!ws) return;

    const now = new Date();
    const status: SubscriptionStatus = entity.status;
    const charges = Math.max(entity.paid_count ?? 0, 0);
    let live = ws.subscriptionId === sub.id;
    let plan = ws.plan;
    let paidUntil = ws.paidUntil;
    let startedNow = false;

    if (options.promote && !live && sub.status === "created" && isApproved(entity)) {
      // The caller has already dealt with a stale set-up and with any earlier mandate; reaching either
      // of these means something changed in between, so nothing is written and the step is retried.
      if (!isSetupFresh(sub.basis, ws)) throw new ApiError(409, "conflict", "The workspace changed while auto-pay was being set up.");
      if (ws.subscriptionId) {
        const [other] = await tx.select({ status: billingSubscriptions.status }).from(billingSubscriptions).where(eq(billingSubscriptions.id, ws.subscriptionId)).limit(1);
        if (other && !isSubscriptionOver(other.status)) throw new ApiError(409, "conflict", "Another auto-pay mandate is still active.");
      }
      live = true;
      if (sub.startAt === null) {
        // Billing starts with the approval itself.
        plan = sub.plan;
        paidUntil = ws.plan === sub.plan && ws.paidUntil && ws.paidUntil > now ? ws.paidUntil : now;
        startedNow = true;
      } else if (ws.plan !== null || sub.startAt <= now) {
        // Billing starts when the time already paid for runs out (converted, if the plan changes).
        plan = sub.plan;
        paidUntil = sub.startAt;
      }
      // Otherwise it was approved during the trial: nothing has been paid yet, so the workspace stays
      // on its trial and gets its plan with the first charge.
    }

    const months = sub.cycle === "yearly" ? 12 : 1;
    // No single charge can pay for more than one cycle from today (plus slack for time zones).
    const cap = new Date(addMonths(now, months).getTime() + 7 * DAY_MS);
    const record = (number: number, start: Date, end: Date, paymentId: string | null) =>
      tx
        .insert(billingPayments)
        .values({
          workspaceId: sub.workspaceId,
          subscriptionId: sub.id,
          cycleNo: number,
          plan: sub.plan,
          cycle: sub.cycle,
          amount: sub.amount,
          currency: sub.currency,
          status: "paid",
          paidAt: now,
          periodStart: start,
          periodEnd: end,
          providerPaymentId: paymentId,
          createdBy: sub.createdBy,
          createdByName: sub.createdByName,
        })
        .onConflictDoNothing();
    const capped = (wanted: Date) => {
      if (wanted <= cap) return wanted;
      console.error("Subscription period end looked wrong and was capped", { subscriptionId: sub.id, wanted, cap });
      return cap;
    };

    let counted = sub.paidCount;
    const cycleEnd = status === "active" ? fromUnix(entity.current_end) : null;
    if (charges > counted && live) {
      // The normal case: Razorpay's count of successful charges on the workspace's mandate went up.
      const anchor = fromUnix(entity.start_at) ?? sub.startAt ?? now;
      for (let number = counted + 1; number <= charges; number++) {
        const latest = number === charges;
        // While the subscription is in good standing Razorpay's own cycle end is the paid-through date;
        // otherwise (a later charge is failing) it is worked out from the number of charges received.
        const end = capped(latest && cycleEnd ? cycleEnd : addMonths(anchor, number * months));
        await record(number, addMonths(end, -months), end, latest ? (options.paymentId ?? null) : null);
        paidUntil = later(paidUntil, end);
      }
      plan = sub.plan;
      counted = charges;
    } else if (charges > counted) {
      // Money taken by a mandate that is not the workspace's auto-pay (a set-up approved after the
      // workspace had moved on, or a last charge on one being stopped). It is never lost: each charge
      // buys time on the plan the workspace is on, after everything already covered.
      const target: PlanId = ws.plan ?? sub.plan;
      for (let number = counted + 1; number <= charges; number++) {
        const start = later(later(paidUntil, ws.trialEndsAt), now);
        const end = new Date(start.getTime() + paidTimeFor(sub.amount, target, sub.currency));
        await record(number, start, end, number === charges ? (options.paymentId ?? null) : null);
        paidUntil = end;
      }
      plan = target;
      counted = charges;
    } else if (live && cycleEnd && cycleEnd > now) {
      // A safety net, in case the count above ever lags behind what Razorpay has collected. Razorpay
      // says the subscription is active in a cycle that runs past what we have counted. That is taken
      // as paid in two situations only: the mandate was approved a moment ago with billing starting at
      // once (so "active" can only mean the first payment went through), or the covered date passed
      // more than a day ago – by then a failed charge would show as "pending", not "active".
      const covered = paidUntil ?? sub.startAt;
      const behind = !covered || cycleEnd.getTime() > covered.getTime() + DAY_MS;
      const overdue = covered !== null && now.getTime() > covered.getTime() + DAY_MS;
      if (behind && (startedNow || overdue)) {
        console.error("Counted a subscription cycle from its dates rather than its charge count", { subscriptionId: sub.id, charges, counted });
        counted += 1;
        const end = capped(cycleEnd);
        await record(counted, addMonths(end, -months), end, options.paymentId ?? null);
        paidUntil = later(paidUntil, end);
        plan = sub.plan;
      }
    }

    await tx
      .update(billingSubscriptions)
      .set({ status, paidCount: Math.max(counted, charges), nextChargeAt: fromUnix(entity.charge_at), syncedAt: now })
      .where(eq(billingSubscriptions.id, sub.id));

    const over = isSubscriptionOver(status);
    await tx
      .update(workspaces)
      .set({
        plan,
        paidUntil,
        ...(live ? { subscriptionId: over ? null : sub.id, subscriptionStatus: over ? null : status, subscriptionSyncedAt: now } : {}),
      })
      .where(eq(workspaces.id, ws.id));
  });
}

/**
 * Brings one subscription up to date with Razorpay. Like payments, nothing from the browser or a
 * webhook body is trusted: the subscription is read from Razorpay with our own keys every time, so
 * this can be called as often as anyone likes.
 */
export async function syncSubscription(db: Database, env: Env, subscriptionId: string, options: { paymentId?: string; timeoutMs?: number } = {}): Promise<void> {
  const [sub] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscriptionId)).limit(1);
  if (!sub?.providerSubscriptionId || isSubscriptionOver(sub.status)) return;

  const entity = await fetchSubscription(env, sub.providerSubscriptionId, options.timeoutMs);
  if (sub.status !== "created" || !isApproved(entity)) return applySubscription(db, sub.id, entity, { promote: false, paymentId: options.paymentId });

  // A set-up has just been approved. Any failure below throws, and the whole step is tried again later.
  const workspace = async () => (await db.select().from(workspaces).where(eq(workspaces.id, sub.workspaceId)).limit(1))[0];
  let ws = await workspace();
  if (!ws) return;
  if (ws.subscriptionId && ws.subscriptionId !== sub.id) {
    // Look at the mandate it would replace first, so a charge that one has just taken is counted
    // before deciding whether this set-up still fits.
    await syncSubscription(db, env, ws.subscriptionId, { timeoutMs: options.timeoutMs });
    ws = await workspace();
    if (!ws) return;
  }
  if (!isSetupFresh(sub.basis, ws)) {
    // The workspace has moved on since this set-up was priced (paid another way, another set-up
    // approved first…). Using it would start billing on the wrong date or plan, so it is stopped
    // instead; anything it has already taken is turned into paid time on the way.
    console.error("An out-of-date auto-pay set-up was approved and has been stopped", { subscriptionId: sub.id });
    return cancelSubscription(db, env, sub.id);
  }
  // It replaces whatever was paying before. The old mandate is stopped first, so there are never two
  // that can both charge.
  if (ws.subscriptionId && ws.subscriptionId !== sub.id) await cancelSubscription(db, env, ws.subscriptionId);
  await applySubscription(db, sub.id, entity, { promote: true, paymentId: options.paymentId });
  await cancelPendingSetups(db, env, sub.workspaceId, sub.id);
}

/**
 * Stops a subscription at Razorpay so it can never charge again, after counting any charge we had
 * not seen yet. The plan and the time already paid for are kept. Throws if Razorpay could not confirm
 * it – callers must not carry on as if auto-pay were off.
 */
export async function cancelSubscription(db: Database, env: Env, subscriptionId: string): Promise<void> {
  const [sub] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscriptionId)).limit(1);
  if (!sub) return;
  const gone = (status: SubscriptionStatus = "cancelled"): ProviderSubscription => ({
    id: sub.providerSubscriptionId ?? "",
    plan_id: sub.providerPlanId ?? "",
    status,
    paid_count: sub.paidCount,
    start_at: null,
    current_start: null,
    current_end: null,
    charge_at: null,
  });
  if (isSubscriptionOver(sub.status)) return applySubscription(db, sub.id, gone(sub.status), { promote: false });
  // Never reached Razorpay, so there is nothing there to stop.
  if (!sub.providerSubscriptionId) return applySubscription(db, sub.id, gone(), { promote: false });

  let entity: ProviderSubscription;
  try {
    entity = await fetchSubscription(env, sub.providerSubscriptionId);
  } catch (error) {
    // Razorpay doesn't know this id under the current keys (e.g. it was made with test keys): it can't charge.
    if (error instanceof RazorpayError && error.rejected) return applySubscription(db, sub.id, gone(), { promote: false });
    throw error;
  }
  await applySubscription(db, sub.id, entity, { promote: false });
  if (isSubscriptionOver(entity.status)) return;

  try {
    entity = await cancelProviderSubscription(env, sub.providerSubscriptionId);
  } catch (error) {
    if (!(error instanceof RazorpayError && error.rejected)) throw error;
    // Refused: usually because it ended in the meantime. Look again and accept only "it is over".
    entity = await fetchSubscription(env, sub.providerSubscriptionId);
    if (!isSubscriptionOver(entity.status)) throw error;
  }
  await applySubscription(db, sub.id, isSubscriptionOver(entity.status) ? entity : { ...entity, status: "cancelled" }, { promote: false });
}

const NOT_OVER = notInArray(billingSubscriptions.status, ["cancelled", "completed", "expired"]);

/**
 * Withdraws auto-pay set-ups that are still waiting to be approved – they were priced on a state the
 * workspace has now left. Best effort: if Razorpay won't confirm, the set-up is caught as out of date
 * if it is ever approved.
 */
export async function cancelPendingSetups(db: Database, env: Env, workspaceId: string, exceptId?: string): Promise<void> {
  const rows = await db
    .select({ id: billingSubscriptions.id })
    .from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.workspaceId, workspaceId), eq(billingSubscriptions.status, "created"), isNotNull(billingSubscriptions.providerSubscriptionId), exceptId ? ne(billingSubscriptions.id, exceptId) : undefined));
  for (const row of rows) {
    try {
      await cancelSubscription(db, env, row.id);
    } catch (error) {
      console.error("Could not withdraw a pending auto-pay set-up", error);
    }
  }
}

/** Stops every subscription of a workspace that could still charge (used before the workspace is deleted). */
export async function cancelAllSubscriptions(db: Database, env: Env, workspaceId: string): Promise<void> {
  const rows = await db
    .select({ id: billingSubscriptions.id })
    .from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.workspaceId, workspaceId), isNotNull(billingSubscriptions.providerSubscriptionId), NOT_OVER));
  for (const row of rows) await cancelSubscription(db, env, row.id);
}

/**
 * The safety net behind the redirect and the webhooks: asks Razorpay about everything of this
 * workspace that might have changed – one-off payments still open, the live mandate, and auto-pay
 * set-ups not yet approved. Problems are logged and skipped, and the answer says whether every check
 * went through; only then is the workspace marked as checked, so a failed look is repeated soon.
 */
export async function reconcileBilling(db: Database, env: Env, workspaceId: string, options: { timeoutMs?: number } = {}): Promise<boolean> {
  if (!isBillingConfigured(env)) return true;
  const [payments, subscriptions, wsRows] = await Promise.all([
    // Every payment page that was opened and not yet seen paid or closed. Pages expire after half an
    // hour, so each of these settles one way or the other the next time it is looked at.
    db
      .select({ id: billingPayments.id })
      .from(billingPayments)
      .where(and(eq(billingPayments.workspaceId, workspaceId), eq(billingPayments.status, "created"), isNotNull(billingPayments.providerLinkId)))
      .orderBy(asc(billingPayments.createdAt))
      .limit(5),
    db
      .select({ id: billingSubscriptions.id })
      .from(billingSubscriptions)
      .where(and(eq(billingSubscriptions.workspaceId, workspaceId), isNotNull(billingSubscriptions.providerSubscriptionId), NOT_OVER))
      .orderBy(desc(billingSubscriptions.createdAt))
      .limit(5),
    db.select({ subscriptionId: workspaces.subscriptionId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
  ]);
  let ok = true;
  for (const payment of payments) {
    try {
      await settlePayment(db, env, payment.id, { timeoutMs: options.timeoutMs });
    } catch (error) {
      ok = false;
      console.error("Could not re-check a pending payment", error);
    }
  }
  // The live mandate first (always, however many set-ups there are), then set-ups from the newest:
  // the first one found approved is used, and any older one is then out of date.
  const liveId = wsRows[0]?.subscriptionId ?? null;
  const ids = [...(liveId ? [liveId] : []), ...subscriptions.map((row) => row.id).filter((id) => id !== liveId)];
  for (const id of ids) {
    try {
      await syncSubscription(db, env, id, { timeoutMs: options.timeoutMs });
    } catch (error) {
      ok = false;
      console.error("Could not re-check a subscription", error);
    }
  }
  if (ok) await db.update(workspaces).set({ subscriptionSyncedAt: new Date() }).where(eq(workspaces.id, workspaceId));
  return ok;
}

/** Whether this isolate has already made sure the switch-on step below has run. */
let switchedOn = false;

/**
 * The first time payments are found switched on, every workspace that has not paid gets a full trial
 * from that moment – the trial clock should not have been running while nobody could pay. Returns
 * true when it has just done so.
 */
export async function ensureBillingSwitchedOn(db: Database, env: Env): Promise<boolean> {
  if (switchedOn || !isBillingConfigured(env)) return false;
  const first = await db.insert(appFlags).values({ key: "billing_switched_on" }).onConflictDoNothing().returning({ key: appFlags.key });
  switchedOn = true;
  if (first.length === 0) return false;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * DAY_MS);
  await db
    .update(workspaces)
    .set({ trialEndsAt })
    .where(and(isNull(workspaces.plan), eq(workspaces.billingExempt, false), lt(workspaces.trialEndsAt, trialEndsAt)));
  return true;
}

/** While nothing is known to be due, a workspace is checked against Razorpay at most this often on page loads. */
const LAZY_CHECK_EVERY_MS = 15 * 60_000;

/**
 * Called when the session is read (every page load). Keeps billing correct even if no webhook ever
 * arrives, without a scheduled job:
 *  - just before the lock screen would be shown, Razorpay is asked once more, so a payment made or a
 *    mandate approved that we never heard about unlocks the workspace instead;
 *  - when an auto-pay charge is due, the check runs after the response and shows on the next load.
 * Returns the workspace row to use for this response.
 */
export async function refreshBillingIfDue(db: Database, env: Env, ws: WorkspaceRow, defer: (task: Promise<unknown>) => void): Promise<WorkspaceRow> {
  if (!isBillingConfigured(env) || ws.billingExempt) return ws;
  const reload = async () => (await db.select().from(workspaces).where(eq(workspaces.id, ws.id)).limit(1))[0] ?? ws;
  let current = ws;
  if (await ensureBillingSwitchedOn(db, env)) current = await reload();

  const now = Date.now();
  if (current.subscriptionSyncedAt && now - current.subscriptionSyncedAt.getTime() < LAZY_CHECK_EVERY_MS) return current;

  // On the Free tier there may be a payment or an approval we never heard about: look before settling for it.
  if (billingOf(env, current).status === "free") {
    try {
      await reconcileBilling(db, env, current.id, { timeoutMs: 4_000 });
      return await reload();
    } catch (error) {
      console.error("Could not re-check billing before locking", error);
      return current;
    }
  }
  const coveredUntil = (current.paidUntil ?? current.trialEndsAt).getTime();
  if (current.subscriptionId !== null && now > coveredUntil - 3_600_000) defer(reconcileBilling(db, env, current.id));
  return current;
}

/** How long Razorpay's page for approving a mandate (or a one-off payment page) stays open. */
export const CHECKOUT_TTL_MS = 30 * 60_000;

/** Auto-pay as the billing screen shows it: the live mandate, and a set-up still waiting to be approved. */
export async function autoPayOverview(db: Database, ws: WorkspaceRow): Promise<{ autoPay: AutoPayDTO | null; pendingSetup: PendingSetupDTO | null }> {
  const state = autoPayStateOf(ws.subscriptionId ? ws.subscriptionStatus : null);
  const [liveRows, pendingRows] = await Promise.all([
    ws.subscriptionId && state ? db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, ws.subscriptionId)).limit(1) : Promise.resolve([] as SubscriptionRow[]),
    db
      .select()
      .from(billingSubscriptions)
      .where(and(eq(billingSubscriptions.workspaceId, ws.id), eq(billingSubscriptions.status, "created"), isNotNull(billingSubscriptions.shortUrl), gt(billingSubscriptions.createdAt, new Date(Date.now() - CHECKOUT_TTL_MS))))
      .orderBy(desc(billingSubscriptions.createdAt))
      .limit(1),
  ]);
  const live = liveRows[0];
  // A set-up priced on a state the workspace has left is not offered again.
  const pending = pendingRows[0] && isSetupFresh(pendingRows[0].basis, ws) ? pendingRows[0] : undefined;
  return {
    autoPay: live && state ? { state, plan: live.plan, amount: live.amount, currency: live.currency, nextChargeAt: state === "stopped" ? null : (live.nextChargeAt ?? ws.paidUntil ?? ws.trialEndsAt).getTime() } : null,
    pendingSetup: pending?.shortUrl ? { plan: pending.plan, amount: pending.amount, currency: pending.currency, url: pending.shortUrl, firstChargeAt: pending.startAt?.getTime() ?? null } : null,
  };
}
