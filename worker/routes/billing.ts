import { Hono } from "hono";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { APP_NAME } from "../../shared/constants";
import { AUTOPAY_TOTAL_CYCLES, PLANS, nextPaidPeriod } from "../../shared/plans";
import { checkoutSchema, paymentCallbackQuery, subscribeSchema } from "../../shared/schemas/billing";
import type { BillingOverview } from "../../shared/types";
import { billingPayments, billingSubscriptions, workspaces } from "../db/schema";
import { ApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { RazorpayError, createPaymentLink, createSubscription, isSubscriptionId, isValidWebhookSignature } from "../lib/razorpay";
import { appOrigin } from "../lib/request";
import { tenant, type Tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import {
  CHECKOUT_TTL_MS,
  autoPayOverview,
  basisOf,
  billingOf,
  cancelPendingSetups,
  cancelSubscription,
  ensureProviderPlan,
  reconcileBilling,
  settlePayment,
  syncSubscription,
  toPaymentDTO,
  usageOf,
} from "../services/billing";
import type { AppEnv } from "../types";

/** Only ever send people to Razorpay's own payment pages. */
function isPaymentPage(url: string, env: Env): boolean {
  try {
    const { protocol, hostname, origin } = new URL(url);
    if (import.meta.env.DEV && env.RAZORPAY_TEST_ORIGIN && origin === new URL(env.RAZORPAY_TEST_ORIGIN).origin) return true;
    return protocol === "https:" && (hostname === "rzp.io" || hostname.endsWith(".rzp.io") || hostname === "razorpay.com" || hostname.endsWith(".razorpay.com"));
  } catch {
    return false;
  }
}

const badPage = () => new ApiError(502, "payment_provider_error", "We couldn't open the payment page. Please try again in a minute.");

/**
 * Razorpay refusing to create a plan or subscription (rather than being unreachable) usually means
 * recurring payments are not enabled on the account yet. The person can still pay month by month.
 */
const autoPayProblem = (error: unknown) =>
  error instanceof RazorpayError && error.providerStatus >= 400 && error.providerStatus < 500
    ? new ApiError(502, "autopay_unavailable", "Auto-pay couldn't be started right now. You can use “Pay month by month instead” below, or try again later.")
    : error;

/** The workspace row as it is now – reconciling with Razorpay may have changed what this request loaded at its start. */
async function freshWorkspace(t: Tenant) {
  const [row] = await t.db.select().from(workspaces).where(eq(workspaces.id, t.workspaceId)).limit(1);
  return row ?? t.workspace;
}

/** Owner/admin on a workspace that can actually be charged. */
function payer(t: Tenant, env: Env) {
  t.requireRole("owner", "admin");
  const billing = billingOf(env, t.workspace);
  if (!billing.enabled) throw new ApiError(503, "billing_not_configured", "Online payments are not switched on yet.");
  if (billing.status === "exempt") throw new ApiError(400, "bad_request", "This workspace doesn't need a plan.");
}

/**
 * Trial, plan and payments. Every route here passes `allowLocked`, because this is the one part of
 * the app that must keep working after a trial or plan has run out.
 */
export const billingRoutes = new Hono<AppEnv>()
  /**
   * Plan, auto-pay, usage against the plan's limits, and past payments. Opening it also asks Razorpay
   * about anything still open – the safety net for when neither the redirect nor a webhook arrived –
   * which is why the billing screen can simply re-read this while it waits for a payment.
   */
  .get("/", rateLimit("PUBLIC_LIMITER"), async (c) => {
    const t = tenant(c, { allowLocked: true });
    t.requireRole("owner", "admin");

    await reconcileBilling(t.db, c.env, t.workspaceId);
    const workspace = await freshWorkspace(t);

    const [usage, payments, auto] = await Promise.all([
      usageOf(t.db, t.workspaceId),
      t.db
        .select()
        .from(billingPayments)
        .where(t.where(billingPayments))
        .orderBy(desc(billingPayments.createdAt))
        .limit(36),
      autoPayOverview(t.db, workspace),
    ]);
    const body: BillingOverview = { billing: billingOf(c.env, workspace), ...auto, usage, payments: payments.filter((payment) => payment.status !== "created").map(toPaymentDTO) };
    return c.json(body);
  })

  /**
   * Starts monthly auto-pay for a plan and answers with Razorpay's page for approving the mandate
   * (UPI AutoPay or card). Nothing changes for the workspace until Razorpay reports it approved.
   */
  .post("/subscribe", rateLimit("AUTH_LIMITER"), validate("json", subscribeSchema), async (c) => {
    const t = tenant(c, { allowLocked: true });
    payer(t, c.env);
    const { plan } = c.req.valid("json");

    // Decide on current facts: a charge or an approval may have happened since this page was loaded.
    await reconcileBilling(t.db, c.env, t.workspaceId);
    const ws = await freshWorkspace(t);
    if (billingOf(c.env, ws).autoPay === "on" && ws.subscriptionId) {
      const [live] = await t.db
        .select({ plan: billingSubscriptions.plan })
        .from(billingSubscriptions)
        .where(t.where(billingSubscriptions, eq(billingSubscriptions.id, ws.subscriptionId)))
        .limit(1);
      if (live?.plan === plan) throw new ApiError(409, "conflict", `Auto-pay is already on for the ${PLANS[plan].name} plan.`);
    }

    const currency = ws.billingCurrency;
    const amount = PLANS[plan].price[currency].monthly;
    const now = new Date();

    // A double click, or coming back to try again, reuses the page that is still open – as long as
    // the workspace is still as it was when that page was priced.
    const basis = basisOf(ws);
    const [open] = await t.db
      .select()
      .from(billingSubscriptions)
      .where(
        t.where(
          billingSubscriptions,
          eq(billingSubscriptions.status, "created"),
          eq(billingSubscriptions.plan, plan),
          eq(billingSubscriptions.amount, amount),
          eq(billingSubscriptions.currency, currency),
          isNotNull(billingSubscriptions.shortUrl),
          gt(billingSubscriptions.createdAt, new Date(now.getTime() - CHECKOUT_TTL_MS / 2)),
        ),
      )
      .orderBy(desc(billingSubscriptions.createdAt))
      .limit(1);
    if (open?.shortUrl && open.basis === basis && isPaymentPage(open.shortUrl, c.env)) return c.json({ url: open.shortUrl });
    // Only one approval page is valid at a time: earlier ones (another plan, or out of date) are withdrawn.
    await cancelPendingSetups(t.db, c.env, t.workspaceId);

    // Billing starts when the time already covered runs out – the rest of the trial, or days already
    // paid for (converted to the new plan's price). If that is less than an hour away it starts now.
    const { start } = nextPaidPeriod({ plan: ws.plan, paidUntil: ws.paidUntil, trialEndsAt: ws.trialEndsAt, billingCurrency: currency }, { plan, cycle: "monthly" }, now);
    const startAt = start.getTime() - now.getTime() > 3_600_000 ? start : null;

    const providerPlanId = await ensureProviderPlan(t.db, c.env, plan, "monthly", amount, currency).catch((error: unknown) => {
      throw autoPayProblem(error);
    });
    const id = newId();
    await t.db.insert(billingSubscriptions).values({ id, workspaceId: t.workspaceId, plan, cycle: "monthly", amount, currency, providerPlanId, startAt, basis, createdBy: t.member.id, createdByName: t.user.name });
    try {
      const created = await createSubscription(c.env, {
        providerPlanId,
        totalCount: AUTOPAY_TOTAL_CYCLES,
        startAt: startAt ? Math.floor(startAt.getTime() / 1000) : undefined,
        expireBy: Math.floor((now.getTime() + CHECKOUT_TTL_MS) / 1000),
        notes: { workspace_id: t.workspaceId, plan, ref: id },
      });
      if (!isSubscriptionId(created.id) || !created.short_url || !isPaymentPage(created.short_url, c.env)) {
        console.error("Razorpay returned an unexpected subscription", { id: created.id });
        throw badPage();
      }
      await t.db
        .update(billingSubscriptions)
        .set({ providerSubscriptionId: created.id, shortUrl: created.short_url })
        .where(t.where(billingSubscriptions, eq(billingSubscriptions.id, id)));
      return c.json({ url: created.short_url }, 201);
    } catch (error) {
      // Nothing usable was created, so don't leave a set-up behind that can never be approved.
      await t.db.delete(billingSubscriptions).where(t.where(billingSubscriptions, eq(billingSubscriptions.id, id), eq(billingSubscriptions.status, "created")));
      throw autoPayProblem(error);
    }
  })

  /** "Not now": withdraws an auto-pay set-up that is waiting to be approved. Nothing has been charged for it. */
  .post("/setup/cancel", rateLimit("AUTH_LIMITER"), async (c) => {
    const t = tenant(c, { allowLocked: true });
    t.requireRole("owner", "admin");
    await cancelPendingSetups(t.db, c.env, t.workspaceId);
    // If Razorpay would not confirm, the page simply stops being offered here once it expires.
    return c.json({ ok: true });
  })

  /** Turns auto-pay off: no further charges. The plan stays until the date already paid for. */
  .post("/auto-pay/cancel", rateLimit("AUTH_LIMITER"), async (c) => {
    const t = tenant(c, { allowLocked: true });
    t.requireRole("owner", "admin");
    const ws = await freshWorkspace(t);
    if (ws.subscriptionId) await cancelSubscription(t.db, c.env, ws.subscriptionId);
    return c.json({ ok: true });
  })

  /**
   * Starts a one-off payment for a plan (a month or a year, no mandate) and answers with the Razorpay
   * page to open. If auto-pay is on, it is turned off when this payment arrives.
   */
  .post("/checkout", rateLimit("AUTH_LIMITER"), validate("json", checkoutSchema), async (c) => {
    const t = tenant(c, { allowLocked: true });
    payer(t, c.env);
    const { plan, cycle } = c.req.valid("json");
    const currency = (await freshWorkspace(t)).billingCurrency;
    const amount = PLANS[plan].price[currency][cycle];

    // A double click, or coming back to try again, reuses the page that is still open.
    const [open] = await t.db
      .select()
      .from(billingPayments)
      .where(
        t.where(
          billingPayments,
          eq(billingPayments.status, "created"),
          eq(billingPayments.plan, plan),
          eq(billingPayments.cycle, cycle),
          eq(billingPayments.amount, amount),
          eq(billingPayments.currency, currency),
          gt(billingPayments.createdAt, new Date(Date.now() - CHECKOUT_TTL_MS / 2)),
        ),
      )
      .orderBy(desc(billingPayments.createdAt))
      .limit(1);
    if (open?.providerLinkUrl && isPaymentPage(open.providerLinkUrl, c.env)) return c.json({ url: open.providerLinkUrl });

    const paymentId = newId();
    await t.db.insert(billingPayments).values({ id: paymentId, workspaceId: t.workspaceId, plan, cycle, amount, currency, createdBy: t.member.id, createdByName: t.user.name });

    const link = await createPaymentLink(c.env, {
      amount,
      currency,
      description: `${APP_NAME} ${PLANS[plan].name} plan – ${cycle === "yearly" ? "1 year" : "1 month"} for ${t.workspace.name}`.slice(0, 250),
      referenceId: paymentId,
      customer: { email: t.user.email },
      callbackUrl: `${appOrigin(c)}/api/billing/callback`,
      expireBy: Math.floor((Date.now() + CHECKOUT_TTL_MS) / 1000),
      notes: { workspace_id: t.workspaceId, plan, cycle },
    });
    if (!isPaymentPage(link.short_url, c.env)) {
      console.error("Razorpay returned an unexpected payment page address");
      throw badPage();
    }
    await t.db
      .update(billingPayments)
      .set({ providerLinkId: link.id, providerLinkUrl: link.short_url })
      .where(t.where(billingPayments, eq(billingPayments.id, paymentId)));
    return c.json({ url: link.short_url }, 201);
  })

  /**
   * Where Razorpay sends the payer after a one-off payment. The address parameters are not trusted:
   * the link id is only used to find our own record, and the payment itself is confirmed with
   * Razorpay directly. Always ends in a redirect to the billing screen, which shows the result.
   */
  .get("/callback", rateLimit("PUBLIC_LIMITER"), async (c) => {
    const back = (result: "paid" | "pending" | "failed") => c.redirect(`${appOrigin(c)}/app/billing?payment=${result}`, 302);
    const query = paymentCallbackQuery.safeParse(c.req.query());
    if (!query.success) return back("failed");
    try {
      const [payment] = await c.var.db
        .select({ id: billingPayments.id })
        .from(billingPayments)
        .where(eq(billingPayments.providerLinkId, query.data.razorpay_payment_link_id))
        .limit(1);
      if (!payment) return back("failed");
      const status = await settlePayment(c.var.db, c.env, payment.id);
      return back(status === "paid" ? "paid" : status === "created" ? "pending" : "failed");
    } catch (error) {
      console.error("Payment callback failed", error);
      return back("pending");
    }
  });

interface WebhookEvent {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: unknown } };
    subscription?: { entity?: { id?: unknown } };
    payment?: { entity?: { id?: unknown } };
  };
}

/**
 * Razorpay → us, server to server. Mounted before the CSRF check (Razorpay sends no Origin header
 * and has no session); the signature over the raw body is what proves where it came from. Even then
 * an event only says "look at this payment link / subscription": amounts and statuses are read from
 * Razorpay. An error answers 5xx, and Razorpay delivers the event again later.
 */
export const webhookRoutes = new Hono<AppEnv>().post("/razorpay", async (c) => {
  // Refuse anything oversized before reading it.
  if (Number(c.req.header("Content-Length") ?? 0) > 200_000) throw new ApiError(413, "too_large", "Too large.");
  const raw = await c.req.text();
  if (raw.length > 200_000 || !(await isValidWebhookSignature(c.env, raw, c.req.header("X-Razorpay-Signature")))) {
    throw new ApiError(401, "unauthorized", "Invalid signature.");
  }
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return c.json({ ok: true });
  }
  const db = c.var.db;

  if (event.event?.startsWith("payment_link.")) {
    const link = paymentCallbackQuery.safeParse({ razorpay_payment_link_id: event.payload?.payment_link?.entity?.id });
    if (!link.success) return c.json({ ok: true });
    const [payment] = await db
      .select({ id: billingPayments.id })
      .from(billingPayments)
      .where(eq(billingPayments.providerLinkId, link.data.razorpay_payment_link_id))
      .limit(1);
    if (payment) await settlePayment(db, c.env, payment.id);
  } else if (event.event?.startsWith("subscription.")) {
    const providerId = event.payload?.subscription?.entity?.id;
    if (!isSubscriptionId(providerId)) return c.json({ ok: true });
    const [subscription] = await db
      .select({ id: billingSubscriptions.id })
      .from(billingSubscriptions)
      .where(and(eq(billingSubscriptions.providerSubscriptionId, providerId)))
      .limit(1);
    const paymentId = event.payload?.payment?.entity?.id;
    if (subscription) await syncSubscription(db, c.env, subscription.id, { paymentId: typeof paymentId === "string" && /^pay_[A-Za-z0-9]{6,40}$/.test(paymentId) ? paymentId : undefined });
  }
  return c.json({ ok: true });
});
