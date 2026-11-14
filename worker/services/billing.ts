import { and, desc, eq, gt, gte, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm";
import { APP_NAME } from "../../shared/constants";
import {
  AUTOPAY_GRACE_DAYS,
  NO_LIMITS,
  PLANS,
  TRIAL_PLAN,
  addMonths,
  autoPayStateOf,
  isSubscriptionOver,
  nextPaidPeriod,
  type BillingCycle,
  type BillingPaymentStatus,
  type PlanId,
  type SubscriptionStatus,
} from "../../shared/plans";
import type { AutoPayDTO, BillingDTO, BillingPaymentDTO, BillingUsage, PendingSetupDTO } from "../../shared/types";
import type { Database } from "../db";
import { billingPayments, billingProviderPlans, billingSubscriptions, contracts, files, invites, leadSources, workspaceMembers, workspaces } from "../db/schema";
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
  const base = { plan: ws.plan, trialEndsAt: ws.trialEndsAt.getTime(), paidUntil: ws.paidUntil?.getTime() ?? null };
  if (!isBillingConfigured(env)) return { ...base, enabled: false, status: "open", daysLeft: null, autoPay: null, limits: NO_LIMITS };
  if (ws.billingExempt) return { ...base, enabled: true, status: "exempt", daysLeft: null, autoPay: null, limits: NO_LIMITS };
  if (ws.plan && ws.paidUntil) {
    // An auto-pay charge is taken on the day the paid period ends and may land a little later (and a
    // failed one is retried), so the plan stays usable for a few days past that date while it does.
    const usableUntil = ws.paidUntil.getTime() + (autoPay === "on" || autoPay === "retrying" ? GRACE_MS : 0);
    if (usableUntil > now.getTime()) {
      return { ...base, enabled: true, status: "active", daysLeft: daysUntil(ws.paidUntil, now), autoPay, limits: PLANS[ws.plan].limits };
    }
  }
  if (!ws.plan && ws.trialEndsAt > now) {
    return { ...base, enabled: true, status: "trial", daysLeft: daysUntil(ws.trialEndsAt, now), autoPay, limits: PLANS[TRIAL_PLAN].limits };
  }
  return { ...base, enabled: true, status: "expired", daysLeft: null, autoPay, limits: PLANS[ws.plan ?? TRIAL_PLAN].limits };
}

/** Thrown by `tenant()` for every request except billing itself once the trial or plan has run out. */
export const subscriptionRequired = (ws: WorkspaceRow) =>
  new ApiError(402, "subscription_required", ws.plan ? `Your plan has ended. Renew it to keep using ${APP_NAME}.` : `Your free trial has ended. Choose a plan to keep using ${APP_NAME}.`);

/* ------------------------------------------------------------------------------------------------
 * Plan limits
 * ---------------------------------------------------------------------------------------------- */

const limitReached = (message: string) => new ApiError(403, "plan_limit", `${message} Upgrade in Billing to add more.`);
const planLabel = (t: Tenant, env: Env) => {
  const billing = billingOf(env, t.workspace);
  return billing.status === "trial" ? "The free trial" : `The ${PLANS[billing.plan ?? TRIAL_PLAN].name} plan`;
};

const startOfMonthUtc = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function usageOf(db: Database, workspaceId: string, now = new Date()): Promise<BillingUsage> {
  const [members, openInvites, sheets, contractsThisMonth, storage] = await Promise.all([
    db.$count(workspaceMembers, and(eq(workspaceMembers.workspaceId, workspaceId), isNull(workspaceMembers.removedAt))),
    db.$count(invites, and(eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now))),
    db.$count(leadSources, and(eq(leadSources.workspaceId, workspaceId), isNull(leadSources.deletedAt))),
    // Deleted contracts still count, so the monthly allowance can't be reset by deleting and recreating.
    db.$count(contracts, and(eq(contracts.workspaceId, workspaceId), gte(contracts.createdAt, startOfMonthUtc(now)))),
    db
      .select({ bytes: sql<string>`coalesce(sum(${files.size}), 0)` })
      .from(files)
      .where(and(eq(files.workspaceId, workspaceId), isNull(files.deletedAt))),
  ]);
  return { members: members + openInvites, sheets, contractsThisMonth, storageBytes: Number(storage[0]?.bytes ?? 0) };
}

/** A seat is needed for every member and for every invitation that is still open. */
export async function assertSeatAvailable(t: Tenant, env: Env, replacingInviteFor?: string): Promise<void> {
  const limit = billingOf(env, t.workspace).limits.members;
  if (limit === null) return;
  const now = new Date();
  const [members, openInvites] = await Promise.all([
    t.db.$count(workspaceMembers, t.where(workspaceMembers, isNull(workspaceMembers.removedAt))),
    t.db.$count(
      invites,
      t.where(invites, isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now), replacingInviteFor ? ne(invites.email, replacingInviteFor) : undefined),
    ),
  ]);
  if (members + openInvites >= limit) {
    throw limitReached(`${planLabel(t, env)} includes ${limit} ${limit === 1 ? "person" : "people"}, counting invitations that are still open.`);
  }
}

/** Checked again when an invitation is accepted, in case the plan changed after it was sent. */
export async function hasSeatFor(db: Database, env: Env, ws: WorkspaceRow): Promise<boolean> {
  const limit = billingOf(env, ws).limits.members;
  if (limit === null) return true;
  return (await db.$count(workspaceMembers, and(eq(workspaceMembers.workspaceId, ws.id), isNull(workspaceMembers.removedAt)))) < limit;
}

export async function assertSheetAvailable(t: Tenant, env: Env): Promise<void> {
  const limit = billingOf(env, t.workspace).limits.sheets;
  if (limit === null) return;
  if ((await t.db.$count(leadSources, t.where(leadSources, isNull(leadSources.deletedAt)))) >= limit) {
    throw limitReached(`${planLabel(t, env)} includes ${limit} connected Google Sheet${limit === 1 ? "" : "s"}.`);
  }
}

export async function assertContractAvailable(t: Tenant, env: Env): Promise<void> {
  const limit = billingOf(env, t.workspace).limits.contractsPerMonth;
  if (limit === null) return;
  if ((await t.db.$count(contracts, t.where(contracts, gte(contracts.createdAt, startOfMonthUtc())))) >= limit) {
    throw limitReached(`${planLabel(t, env)} includes ${limit} contracts a month, and this month's are used up.`);
  }
}

export async function assertStorageAvailable(t: Tenant, env: Env, addingBytes: number): Promise<void> {
  const limit = billingOf(env, t.workspace).limits.storageBytes;
  if (limit === null) return;
  const [row] = await t.db
    .select({ bytes: sql<string>`coalesce(sum(${files.size}), 0)` })
    .from(files)
    .where(t.where(files, isNull(files.deletedAt)));
  if (Number(row?.bytes ?? 0) + addingBytes > limit) {
    throw limitReached(`${planLabel(t, env)} includes ${Math.round(limit / 1024 ** 3)} GB of file storage, and it is full.`);
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

    const now = new Date();
    const period = nextPaidPeriod({ plan: ws.plan, paidUntil: ws.paidUntil, trialEndsAt: ws.trialEndsAt }, { plan: locked.plan, cycle: locked.cycle }, now);
    await tx.update(workspaces).set({ plan: locked.plan, paidUntil: period.end }).where(eq(workspaces.id, ws.id));
    await tx
      .update(billingPayments)
      .set({ status: "paid", paidAt: now, periodStart: period.start, periodEnd: period.end, providerPaymentId })
      .where(eq(billingPayments.id, locked.id));
  });
  return "paid";
}

/* ------------------------------------------------------------------------------------------------
 * Auto-pay (Razorpay subscriptions)
 * ---------------------------------------------------------------------------------------------- */

/** The Razorpay plan (a fixed amount per month) for one of ours, created the first time it is needed. */
export async function ensureProviderPlan(db: Database, env: Env, plan: PlanId, cycle: BillingCycle, amount: number): Promise<string> {
  // Test and live keys have separate plans, and a plan's price can never change, so both are part of the key.
  const key = `${env.RAZORPAY_KEY_ID?.trim()}:${plan}:${cycle}:${amount}`;
  const [known] = await db.select().from(billingProviderPlans).where(eq(billingProviderPlans.key, key)).limit(1);
  if (known) return known.providerPlanId;

  const providerPlanId = await createProviderPlan(env, { name: `${APP_NAME} ${PLANS[plan].name} – ${cycle}`, amount, period: cycle });
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
 *  - the first time the mandate is approved, the subscription becomes the workspace's auto-pay and
 *    its plan (`promote`);
 *  - every charge not yet counted adds its month to the workspace's paid time and a row to the
 *    payment history (each charge has a number, so none is ever counted twice);
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

    let promotedToStartNow = false;
    if (options.promote && !live && sub.status === "created" && isApproved(entity)) {
      if (ws.subscriptionId) {
        // The caller stops any earlier mandate before promoting a new one; reaching this means it
        // could not, so nothing is changed and the step is tried again later.
        const [other] = await tx.select({ status: billingSubscriptions.status }).from(billingSubscriptions).where(eq(billingSubscriptions.id, ws.subscriptionId)).limit(1);
        if (other && !isSubscriptionOver(other.status)) throw new ApiError(409, "conflict", "Another auto-pay mandate is still active.");
      }
      live = true;
      // Until the first charge lands the workspace is covered up to the planned start (the end of the
      // trial, or of the time already paid for, converted to the new plan) – or just until now.
      const startsLater = sub.startAt !== null && sub.startAt > now;
      const keepsTime = ws.plan === sub.plan && ws.paidUntil && ws.paidUntil > now ? ws.paidUntil : now;
      paidUntil = startsLater ? sub.startAt : keepsTime;
      plan = sub.plan;
      promotedToStartNow = !startsLater;
    }

    const step = sub.cycle === "yearly" ? 12 : 1;
    // No single charge can pay for more than one cycle from today (plus slack for time zones).
    const cap = new Date(addMonths(now, step).getTime() + 7 * DAY_MS);
    const record = async (number: number, wanted: Date, paymentId: string | null) => {
      let periodEnd = wanted;
      if (periodEnd > cap) {
        console.error("Subscription period end looked wrong and was capped", { subscriptionId: sub.id, periodEnd, cap });
        periodEnd = cap;
      }
      await tx
        .insert(billingPayments)
        .values({
          workspaceId: sub.workspaceId,
          subscriptionId: sub.id,
          cycleNo: number,
          plan: sub.plan,
          cycle: sub.cycle,
          amount: sub.amount,
          status: "paid",
          paidAt: now,
          periodStart: addMonths(periodEnd, -step),
          periodEnd,
          providerPaymentId: paymentId,
          createdBy: sub.createdBy,
          createdByName: sub.createdByName,
        })
        .onConflictDoNothing();
      return periodEnd;
    };

    let counted = sub.paidCount;
    const cycleEnd = status === "active" ? fromUnix(entity.current_end) : null;
    if (charges > counted) {
      // The normal case: Razorpay's count of successful charges has gone up.
      const anchor = fromUnix(entity.start_at) ?? sub.startAt ?? now;
      let creditedEnd: Date | null = null;
      for (let number = counted + 1; number <= charges; number++) {
        const latest = number === charges;
        // While the subscription is in good standing Razorpay's own cycle end is the paid-through date;
        // otherwise (a later charge is failing) it is worked out from the number of charges received.
        creditedEnd = await record(number, latest && cycleEnd ? cycleEnd : addMonths(anchor, number * step), latest ? (options.paymentId ?? null) : null);
      }
      counted = charges;
      if (live && creditedEnd) {
        paidUntil = later(paidUntil, creditedEnd);
        plan = sub.plan;
      } else if (!live) {
        console.error("A charge arrived on a subscription that is not the workspace's auto-pay", { subscriptionId: sub.id });
      }
    } else if (live && cycleEnd && cycleEnd > now && (!paidUntil || cycleEnd.getTime() > paidUntil.getTime() + DAY_MS)) {
      // A safety net, in case the count above ever lags behind what Razorpay has collected. Razorpay
      // says the subscription is active in a cycle that runs past what we have counted. That is taken
      // as paid in two situations only: the mandate was approved a moment ago with billing starting at
      // once (so "active" can only mean the first payment went through), or the paid date passed more
      // than a day ago – by then a failed charge would show as "pending", not "active".
      const overdue = paidUntil !== null && now.getTime() > paidUntil.getTime() + DAY_MS;
      if (promotedToStartNow || overdue) {
        console.error("Counted a subscription cycle from its dates rather than its charge count", { subscriptionId: sub.id, charges, counted });
        counted += 1;
        paidUntil = later(paidUntil, await record(counted, cycleEnd, options.paymentId ?? null));
        plan = sub.plan;
      }
    }

    await tx
      .update(billingSubscriptions)
      .set({ status, paidCount: Math.max(counted, charges), startAt: fromUnix(entity.start_at) ?? sub.startAt, nextChargeAt: fromUnix(entity.charge_at), syncedAt: now })
      .where(eq(billingSubscriptions.id, sub.id));

    if (live) {
      const over = isSubscriptionOver(status);
      await tx
        .update(workspaces)
        .set({ plan, paidUntil, subscriptionId: over ? null : sub.id, subscriptionStatus: over ? null : status, subscriptionSyncedAt: now })
        .where(eq(workspaces.id, ws.id));
    }
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
  if (sub.status === "created" && isApproved(entity)) {
    // A newly approved mandate replaces whatever was paying before. The old one is stopped first, so
    // there are never two that can both charge; if that fails, this throws and is tried again later.
    const [ws] = await db.select({ subscriptionId: workspaces.subscriptionId }).from(workspaces).where(eq(workspaces.id, sub.workspaceId)).limit(1);
    if (ws?.subscriptionId && ws.subscriptionId !== sub.id) await cancelSubscription(db, env, ws.subscriptionId);
  }
  await applySubscription(db, sub.id, entity, { promote: true, paymentId: options.paymentId });
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

/** Stops every subscription of a workspace that could still charge (used before the workspace is deleted). */
export async function cancelAllSubscriptions(db: Database, env: Env, workspaceId: string): Promise<void> {
  const rows = await db
    .select({ id: billingSubscriptions.id })
    .from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.workspaceId, workspaceId), isNotNull(billingSubscriptions.providerSubscriptionId), notInArray(billingSubscriptions.status, ["cancelled", "completed", "expired"])));
  for (const row of rows) await cancelSubscription(db, env, row.id);
}

/** One-off payments started recently but never confirmed are looked at again for this long. */
const RECHECK_WINDOW_MS = 24 * 3_600_000;

/**
 * The safety net behind the redirect and the webhooks: asks Razorpay about everything of this
 * workspace that might have changed – one-off payments still open, auto-pay set-ups not yet approved,
 * and the live mandate. Problems are logged and skipped; the next call tries again.
 */
export async function reconcileBilling(db: Database, env: Env, workspaceId: string, options: { timeoutMs?: number } = {}): Promise<void> {
  if (!isBillingConfigured(env)) return;
  const [payments, subscriptions] = await Promise.all([
    db
      .select({ id: billingPayments.id })
      .from(billingPayments)
      .where(and(eq(billingPayments.workspaceId, workspaceId), eq(billingPayments.status, "created"), isNotNull(billingPayments.providerLinkId), gt(billingPayments.createdAt, new Date(Date.now() - RECHECK_WINDOW_MS))))
      .orderBy(desc(billingPayments.createdAt))
      .limit(3),
    db
      .select({ id: billingSubscriptions.id })
      .from(billingSubscriptions)
      .where(and(eq(billingSubscriptions.workspaceId, workspaceId), isNotNull(billingSubscriptions.providerSubscriptionId), notInArray(billingSubscriptions.status, ["cancelled", "completed", "expired"])))
      .orderBy(desc(billingSubscriptions.createdAt))
      .limit(4),
  ]);
  for (const payment of payments) {
    try {
      await settlePayment(db, env, payment.id, { timeoutMs: options.timeoutMs });
    } catch (error) {
      console.error("Could not re-check a pending payment", error);
    }
  }
  // Oldest first, so that if two set-ups were both approved the newest ends up as the live one.
  for (const subscription of subscriptions.reverse()) {
    try {
      await syncSubscription(db, env, subscription.id, { timeoutMs: options.timeoutMs });
    } catch (error) {
      console.error("Could not re-check a subscription", error);
    }
  }
  await db.update(workspaces).set({ subscriptionSyncedAt: new Date() }).where(eq(workspaces.id, workspaceId));
}

/** While nothing is known to be due, a workspace is checked against Razorpay at most this often on page loads. */
const LAZY_CHECK_EVERY_MS = 15 * 60_000;

/**
 * Called when the session is read (every page load). Keeps billing correct even if no webhook ever
 * arrives, without a scheduled job:
 *  - just before the lock screen would be shown, Razorpay is asked once more, so a mandate approved
 *    or a charge taken that we never heard about unlocks the workspace instead;
 *  - when an auto-pay charge is due, the check runs after the response and shows on the next load.
 * Returns the workspace row to use for this response.
 */
export async function refreshBillingIfDue(db: Database, env: Env, ws: WorkspaceRow, defer: (task: Promise<unknown>) => void): Promise<WorkspaceRow> {
  if (!isBillingConfigured(env) || ws.billingExempt) return ws;
  const now = Date.now();
  if (ws.subscriptionSyncedAt && now - ws.subscriptionSyncedAt.getTime() < LAZY_CHECK_EVERY_MS) return ws;

  if (billingOf(env, ws).status === "expired") {
    try {
      await reconcileBilling(db, env, ws.id, { timeoutMs: 4_000 });
      const [fresh] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id)).limit(1);
      return fresh ?? ws;
    } catch (error) {
      console.error("Could not re-check billing before locking", error);
      return ws;
    }
  }
  const chargeDue = ws.subscriptionId !== null && ws.paidUntil !== null && now > ws.paidUntil.getTime() - 3_600_000;
  if (chargeDue) defer(reconcileBilling(db, env, ws.id));
  return ws;
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
  const pending = pendingRows[0];
  return {
    autoPay: live && state ? { state, plan: live.plan, amount: live.amount, nextChargeAt: state === "stopped" ? null : (live.nextChargeAt?.getTime() ?? ws.paidUntil?.getTime() ?? null) } : null,
    pendingSetup: pending?.shortUrl ? { plan: pending.plan, amount: pending.amount, url: pending.shortUrl, firstChargeAt: pending.startAt?.getTime() ?? null } : null,
  };
}
