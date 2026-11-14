import { and, eq, gt, gte, isNull, ne, sql } from "drizzle-orm";
import { APP_NAME } from "../../shared/constants";
import { NO_LIMITS, PLANS, TRIAL_PLAN, nextPaidPeriod, type BillingPaymentStatus } from "../../shared/plans";
import type { BillingDTO, BillingPaymentDTO, BillingUsage } from "../../shared/types";
import type { Database } from "../db";
import { billingPayments, contracts, files, invites, leadSources, workspaceMembers, workspaces } from "../db/schema";
import { ApiError } from "../lib/errors";
import { fetchPaymentLink, isBillingConfigured } from "../lib/razorpay";
import type { Tenant } from "../lib/tenant";
import type { WorkspaceRow } from "../types";

const DAY_MS = 86_400_000;
const daysUntil = (end: Date, now: Date) => Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));

/**
 * Where a workspace stands right now. Pure and cheap: it is worked out from the workspace row on
 * every request, so there is no scheduled job that has to "expire" anyone.
 */
export function billingOf(env: Env, ws: WorkspaceRow, now = new Date()): BillingDTO {
  const base = { plan: ws.plan, trialEndsAt: ws.trialEndsAt.getTime(), paidUntil: ws.paidUntil?.getTime() ?? null };
  if (!isBillingConfigured(env)) return { ...base, enabled: false, status: "open", daysLeft: null, limits: NO_LIMITS };
  if (ws.billingExempt) return { ...base, enabled: true, status: "exempt", daysLeft: null, limits: NO_LIMITS };
  if (ws.plan && ws.paidUntil && ws.paidUntil > now) {
    return { ...base, enabled: true, status: "active", daysLeft: daysUntil(ws.paidUntil, now), limits: PLANS[ws.plan].limits };
  }
  if (!ws.plan && ws.trialEndsAt > now) {
    return { ...base, enabled: true, status: "trial", daysLeft: daysUntil(ws.trialEndsAt, now), limits: PLANS[TRIAL_PLAN].limits };
  }
  return { ...base, enabled: true, status: "expired", daysLeft: null, limits: PLANS[ws.plan ?? TRIAL_PLAN].limits };
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
 * Payments
 * ---------------------------------------------------------------------------------------------- */

type PaymentRow = typeof billingPayments.$inferSelect;

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
});

/**
 * Brings one payment up to date with Razorpay and, if it has been paid, starts the plan.
 *
 * Nothing sent by the browser is trusted here: the payment link is read back from Razorpay with our
 * own keys, and only "paid, in full, in the right currency, for this reference" counts. It is safe to
 * call any number of times (redirect, webhook and page load can all arrive for the same payment):
 * the row is locked and a payment that is already settled is left alone.
 */
export async function settlePayment(db: Database, env: Env, paymentId: string): Promise<BillingPaymentStatus> {
  const [payment] = await db.select().from(billingPayments).where(eq(billingPayments.id, paymentId)).limit(1);
  if (!payment) return "failed";
  if (payment.status !== "created" || !payment.providerLinkId) return payment.status;

  const link = await fetchPaymentLink(env, payment.providerLinkId);
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
