import { Hono } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import { APP_NAME } from "../../shared/constants";
import { PLANS } from "../../shared/plans";
import { checkoutSchema, paymentCallbackQuery } from "../../shared/schemas/billing";
import type { BillingOverview } from "../../shared/types";
import { billingPayments } from "../db/schema";
import { ApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { createPaymentLink, isValidWebhookSignature } from "../lib/razorpay";
import { appOrigin } from "../lib/request";
import { tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { billingOf, settlePayment, toPaymentDTO, usageOf } from "../services/billing";
import type { AppEnv } from "../types";

/** A payment page stays open this long; a second click on "Pay" within that time reopens the same page. */
const LINK_TTL_MS = 30 * 60_000;
/** Payments that were started recently but never confirmed are re-checked when the billing screen opens. */
const RECHECK_WINDOW_MS = 24 * 3_600_000;

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

/**
 * Trial, plan and payments. Every route here passes `allowLocked`, because this is the one part of
 * the app that must keep working after a trial or plan has run out.
 */
export const billingRoutes = new Hono<AppEnv>()
  /** Plan, usage against the plan's limits, and past payments. */
  .get("/", async (c) => {
    const t = tenant(c, { allowLocked: true });
    t.requireRole("owner", "admin");

    // The redirect back from Razorpay and its webhook normally settle a payment. This is the safety
    // net for when neither arrived (tab closed early, webhook not set up).
    const pending = await t.db
      .select({ id: billingPayments.id })
      .from(billingPayments)
      .where(t.where(billingPayments, eq(billingPayments.status, "created"), gt(billingPayments.createdAt, new Date(Date.now() - RECHECK_WINDOW_MS))))
      .orderBy(desc(billingPayments.createdAt))
      .limit(3);
    let settled = false;
    for (const payment of pending) {
      try {
        settled = (await settlePayment(t.db, c.env, payment.id)) === "paid" || settled;
      } catch (error) {
        console.error("Could not re-check a pending payment", error);
      }
    }
    // A payment that was just settled changed the workspace row this request loaded at its start.
    const workspace = settled ? await t.db.query.workspaces.findFirst({ where: (ws, { eq: equals }) => equals(ws.id, t.workspaceId) }) : t.workspace;

    const [usage, payments] = await Promise.all([
      usageOf(t.db, t.workspaceId),
      t.db
        .select()
        .from(billingPayments)
        .where(t.where(billingPayments))
        .orderBy(desc(billingPayments.createdAt))
        .limit(24),
    ]);
    const body: BillingOverview = { billing: billingOf(c.env, workspace ?? t.workspace), usage, payments: payments.filter((payment) => payment.status !== "created").map(toPaymentDTO) };
    return c.json(body);
  })

  /** Starts a payment for a plan and answers with the Razorpay page to open. */
  .post("/checkout", rateLimit("AUTH_LIMITER"), validate("json", checkoutSchema), async (c) => {
    const t = tenant(c, { allowLocked: true });
    t.requireRole("owner", "admin");
    const { plan, cycle } = c.req.valid("json");

    const billing = billingOf(c.env, t.workspace);
    if (!billing.enabled) throw new ApiError(503, "billing_not_configured", "Online payments are not switched on yet.");
    if (billing.status === "exempt") throw new ApiError(400, "bad_request", "This workspace doesn't need a plan.");

    const amount = PLANS[plan].price[cycle];

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
          gt(billingPayments.createdAt, new Date(Date.now() - LINK_TTL_MS / 2)),
        ),
      )
      .orderBy(desc(billingPayments.createdAt))
      .limit(1);
    if (open?.providerLinkUrl && isPaymentPage(open.providerLinkUrl, c.env)) return c.json({ url: open.providerLinkUrl });

    const paymentId = newId();
    await t.db.insert(billingPayments).values({ id: paymentId, workspaceId: t.workspaceId, plan, cycle, amount, createdBy: t.member.id, createdByName: t.user.name });

    const link = await createPaymentLink(c.env, {
      amount,
      description: `${APP_NAME} ${PLANS[plan].name} plan – ${cycle === "yearly" ? "1 year" : "1 month"} for ${t.workspace.name}`.slice(0, 250),
      referenceId: paymentId,
      customer: { name: t.user.name.slice(0, 100), email: t.user.email },
      callbackUrl: `${appOrigin(c)}/api/billing/callback`,
      expireBy: Math.floor((Date.now() + LINK_TTL_MS) / 1000),
      notes: { workspace_id: t.workspaceId, plan, cycle },
    });
    if (!isPaymentPage(link.short_url, c.env)) {
      console.error("Razorpay returned an unexpected payment page address");
      throw new ApiError(502, "payment_provider_error", "We couldn't open the payment page. Please try again in a minute.");
    }
    await t.db
      .update(billingPayments)
      .set({ providerLinkId: link.id, providerLinkUrl: link.short_url })
      .where(t.where(billingPayments, eq(billingPayments.id, paymentId)));
    return c.json({ url: link.short_url }, 201);
  })

  /**
   * Where Razorpay sends the payer afterwards. The address parameters are not trusted: the link id is
   * only used to find our own record, and the payment itself is confirmed with Razorpay directly.
   * Always ends in a redirect to the billing screen, which shows the result.
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

/**
 * Razorpay → us, server to server. Mounted before the CSRF check (Razorpay sends no Origin header
 * and has no session); the signature over the raw body is what proves where it came from. Even then
 * the event only says "look at this payment link": the amount and status are read from Razorpay.
 */
export const webhookRoutes = new Hono<AppEnv>().post("/razorpay", async (c) => {
  const raw = await c.req.text();
  if (raw.length > 200_000 || !(await isValidWebhookSignature(c.env, raw, c.req.header("X-Razorpay-Signature")))) {
    throw new ApiError(401, "unauthorized", "Invalid signature.");
  }
  let linkId: unknown;
  try {
    const event = JSON.parse(raw) as { event?: string; payload?: { payment_link?: { entity?: { id?: unknown } } } };
    if (!event.event?.startsWith("payment_link.")) return c.json({ ok: true });
    linkId = event.payload?.payment_link?.entity?.id;
  } catch {
    return c.json({ ok: true });
  }
  const parsed = paymentCallbackQuery.safeParse({ razorpay_payment_link_id: linkId });
  if (!parsed.success) return c.json({ ok: true });

  const [payment] = await c.var.db
    .select({ id: billingPayments.id })
    .from(billingPayments)
    .where(and(eq(billingPayments.providerLinkId, parsed.data.razorpay_payment_link_id)))
    .limit(1);
  // An error here answers 5xx, and Razorpay delivers the event again later.
  if (payment) await settlePayment(c.var.db, c.env, payment.id);
  return c.json({ ok: true });
});
