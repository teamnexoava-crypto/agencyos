/**
 * Dodo Payments: how plans are paid for outside India (in US dollars). Dodo is the merchant of record,
 * so it works out and collects sales tax / VAT in the buyer's country; we only see the price.
 *
 * The billing service was built around Razorpay, so the two reads it relies on – "has this checkout
 * been paid?" and "where is this subscription?" – are translated here into the same shapes Razorpay
 * gives (`PaymentLink`, `ProviderSubscription`). Everything else in billing then works the same for
 * both providers. Nothing from a browser or a webhook body is trusted: every answer comes from Dodo's
 * API with our own key.
 */
import type { BillingCurrency, BillingCycle, SubscriptionStatus } from "../../shared/plans";
import { hmacSha256Hex } from "./crypto";
import { ApiError } from "./errors";
import { PaymentProviderError } from "./payment-provider";
import type { PaymentLink, ProviderSubscription } from "./razorpay";

/** International payments are switched on once Dodo's API key is present. */
export const isDodoConfigured = (env: Env): boolean => Boolean(env.DODO_PAYMENTS_API_KEY?.trim());

/** Test mode unless `DODO_PAYMENTS_ENVIRONMENT` says `live_mode`. Not a secret. */
export function dodoMode(env: Env): "off" | "test" | "live" {
  if (!isDodoConfigured(env)) return "off";
  return env.DODO_PAYMENTS_ENVIRONMENT?.trim() === "live_mode" ? "live" : "test";
}

/** A failed call to Dodo Payments. */
export class DodoError extends PaymentProviderError {}

function origin(env: Env): string {
  // Local development only: tests talk to a stub instead of Dodo.
  if (import.meta.env.DEV && env.DODO_TEST_ORIGIN) return env.DODO_TEST_ORIGIN;
  return dodoMode(env) === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

async function call<T>(env: Env, method: "GET" | "POST" | "PATCH", path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  if (!isDodoConfigured(env)) throw new ApiError(503, "billing_not_configured", "Online payments are not switched on yet.");
  let response: Response;
  try {
    response = await fetch(`${origin(env)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY?.trim()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    console.error("Dodo request failed", { path, error });
    throw new DodoError(0);
  }
  if (!response.ok) {
    // The body can describe the problem (e.g. a wrong key) but never contains our key.
    console.error("Dodo answered with an error", { path, status: response.status, body: (await response.text()).slice(0, 500) });
    throw new DodoError(response.status === 422 ? 400 : response.status);
  }
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------------------------------------
 * Ids – checked before they are put into a URL
 * ---------------------------------------------------------------------------------------------- */

const SAFE_ID = /^[A-Za-z0-9_-]{4,80}$/;
export const isDodoId = (value: unknown): value is string => typeof value === "string" && SAFE_ID.test(value);
const checked = (id: string) => {
  if (!isDodoId(id)) throw new ApiError(400, "bad_request", "Unknown payment.");
  return id;
};

/* ------------------------------------------------------------------------------------------------
 * Products: one per plan, cycle and kind (auto-renewing or a single payment)
 * ---------------------------------------------------------------------------------------------- */

export interface NewDodoProduct {
  name: string;
  /** Cents. The price is tax-inclusive: the buyer pays exactly this, and Dodo takes any tax out of it. */
  amount: number;
  currency: BillingCurrency;
  cycle: BillingCycle;
  /** `recurring` renews every cycle by itself; `once` is a single payment for one cycle. */
  kind: "recurring" | "once";
}

export async function createDodoProduct(env: Env, input: NewDodoProduct): Promise<string> {
  const price =
    input.kind === "once"
      ? { type: "one_time_price", currency: input.currency, price: input.amount, discount: 0, purchasing_power_parity: false, tax_inclusive: true }
      : {
          type: "recurring_price",
          currency: input.currency,
          price: input.amount,
          discount: 0,
          purchasing_power_parity: false,
          tax_inclusive: true,
          payment_frequency_count: 1,
          payment_frequency_interval: input.cycle === "yearly" ? "Year" : "Month",
          // How long the subscription runs before it has to be set up again (like Razorpay's 60 cycles).
          subscription_period_count: 5,
          subscription_period_interval: "Year",
          trial_period_days: 0,
        };
  const product = await call<{ product_id: string }>(env, "POST", "/products", { name: input.name, tax_category: "saas", price });
  if (!isDodoId(product.product_id)) throw new DodoError(502);
  return product.product_id;
}

/** Products are remembered per API key (test and live keys, or another account, each get their own). */
export async function dodoKeyFingerprint(env: Env): Promise<string> {
  return (await hmacSha256Hex("dodo-product-key", env.DODO_PAYMENTS_API_KEY?.trim() ?? "")).slice(0, 12);
}

/* ------------------------------------------------------------------------------------------------
 * Checkout sessions: Dodo's hosted page, for a single payment or to start a subscription
 * ---------------------------------------------------------------------------------------------- */

interface NewDodoCheckout {
  productId: string;
  email: string;
  /** Where Dodo sends the payer afterwards. */
  returnUrl: string;
  /** Copied onto the payment and the subscription, so we can recognise them later. */
  metadata: Record<string, string>;
  /** Subscriptions only: days before the first charge (the rest of the trial or of time already paid for). */
  trialDays?: number;
}

export async function createDodoCheckout(env: Env, input: NewDodoCheckout): Promise<{ id: string; url: string }> {
  const session = await call<{ session_id: string; checkout_url?: string | null }>(env, "POST", "/checkouts", {
    product_cart: [{ product_id: checked(input.productId), quantity: 1 }],
    customer: { email: input.email },
    return_url: input.returnUrl,
    metadata: input.metadata,
    ...(input.trialDays ? { subscription_data: { trial_period_days: input.trialDays } } : {}),
  });
  if (!isDodoId(session.session_id) || !session.checkout_url) throw new DodoError(502);
  return { id: session.session_id, url: session.checkout_url };
}

interface DodoCheckoutStatus {
  id: string;
  payment_id?: string | null;
  payment_status?: string | null;
}

export const fetchDodoCheckout = (env: Env, id: string, timeoutMs?: number) => call<DodoCheckoutStatus>(env, "GET", `/checkouts/${checked(id)}`, undefined, timeoutMs);

/* ------------------------------------------------------------------------------------------------
 * Payments
 * ---------------------------------------------------------------------------------------------- */

export interface DodoPayment {
  payment_id: string;
  status?: string | null;
  /** Cents, including any tax (our prices are tax-inclusive, so this is the price). */
  total_amount: number;
  currency: string;
  metadata?: Record<string, string> | null;
  subscription_ids?: string[] | null;
  checkout_session_id?: string | null;
  /** A zero-amount charge that only saves a card, e.g. at the start of a trial. */
  is_update_payment_method?: boolean;
  created_at: string;
}

export const fetchDodoPayment = (env: Env, id: string, timeoutMs?: number) => call<DodoPayment>(env, "GET", `/payments/${checked(id)}`, undefined, timeoutMs);

/** The money a subscription has actually collected: its successful, non-zero charges. */
async function chargesOf(env: Env, subscriptionId: string, timeoutMs?: number): Promise<DodoPayment[]> {
  const page = await call<{ items?: DodoPayment[] }>(env, "GET", `/payments?subscription_id=${encodeURIComponent(subscriptionId)}&status=succeeded&page_size=100&page_number=0`, undefined, timeoutMs);
  return (page.items ?? []).filter((payment) => payment.status === "succeeded" && payment.total_amount > 0 && !payment.is_update_payment_method);
}

/**
 * Dodo has no expiry time on a checkout page we can set, and a page can be paid a while after it was
 * opened. So an unpaid one is only given up on (and its row closed) after this long.
 */
export const DODO_CHECKOUT_GIVE_UP_MS = 48 * 3_600_000;

/**
 * A checkout for a single payment, read from Dodo and described the way Razorpay describes a payment
 * link, so `settlePayment` can treat both alike. `reference_id` is the `ref` we put in its metadata.
 */
export async function dodoCheckoutAsLink(env: Env, row: { id: string; providerLinkId: string; createdAt: Date; amount: number }, timeoutMs?: number): Promise<PaymentLink> {
  const session = await fetchDodoCheckout(env, row.providerLinkId, timeoutMs);
  const paymentId = isDodoId(session.payment_id) ? session.payment_id : null;
  const payment = paymentId && session.payment_status === "succeeded" ? await fetchDodoPayment(env, paymentId, timeoutMs) : null;
  // The payment is the one Dodo names for our own checkout session, so it is ours ("reference" = our row).
  if (payment?.status === "succeeded" && (!payment.checkout_session_id || payment.checkout_session_id === row.providerLinkId)) {
    return {
      id: row.providerLinkId,
      short_url: "",
      status: "paid",
      amount: row.amount,
      amount_paid: payment.total_amount,
      currency: payment.currency,
      reference_id: row.id,
      payments: [{ payment_id: payment.payment_id, status: "captured" }],
    };
  }
  const givenUp = Date.now() - row.createdAt.getTime() > DODO_CHECKOUT_GIVE_UP_MS;
  return { id: row.providerLinkId, short_url: "", status: givenUp ? "expired" : "created", amount: row.amount, amount_paid: 0, currency: payment?.currency ?? "", payments: null };
}

/* ------------------------------------------------------------------------------------------------
 * Subscriptions: monthly auto-pay by card
 * ---------------------------------------------------------------------------------------------- */

export type DodoSubscriptionStatus = "pending" | "active" | "on_hold" | "paused" | "cancelled" | "failed" | "expired" | "past_due";

export interface DodoSubscription {
  subscription_id: string;
  status: DodoSubscriptionStatus;
  product_id: string;
  currency: string;
  recurring_pre_tax_amount: number;
  created_at: string;
  /** Start of the current period (the last charge). */
  previous_billing_date: string;
  /** End of the current period: when the next charge is due. */
  next_billing_date: string;
  trial_period_days: number;
  metadata?: Record<string, string> | null;
}

export const fetchDodoSubscription = (env: Env, id: string, timeoutMs?: number) => call<DodoSubscription>(env, "GET", `/subscriptions/${checked(id)}`, undefined, timeoutMs);

/** Stops a subscription now: no further charges are taken. */
export const cancelDodoSubscription = (env: Env, id: string) => call<DodoSubscription>(env, "PATCH", `/subscriptions/${checked(id)}`, { status: "cancelled" });

const seconds = (iso: string | null | undefined) => {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

/** Dodo's subscription statuses in Razorpay's words, which is what the billing service and the UI understand. */
function statusOf(entity: DodoSubscription, charges: number): SubscriptionStatus {
  switch (entity.status) {
    case "pending":
      return "created";
    case "active":
      // Approved, but nothing charged yet (still in the trial or in time already paid for).
      return charges > 0 ? "active" : "authenticated";
    case "on_hold":
    case "past_due":
      return "pending";
    case "paused":
      return "paused";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "expired";
    case "expired":
      return "completed";
  }
}

/** A Dodo subscription, with its successful charges counted, in the shape the billing service reads. */
export async function dodoSubscriptionView(env: Env, entity: DodoSubscription, timeoutMs?: number): Promise<ProviderSubscription> {
  const charges = (await chargesOf(env, entity.subscription_id, timeoutMs)).length;
  const status = statusOf(entity, charges);
  const created = seconds(entity.created_at);
  const live = status === "active" || status === "authenticated" || status === "pending";
  return {
    id: entity.subscription_id,
    plan_id: entity.product_id,
    status,
    short_url: null,
    paid_count: charges,
    // Billing starts when the trial days given at checkout run out.
    start_at: created === null ? null : created + Math.max(entity.trial_period_days, 0) * 86_400,
    current_start: seconds(entity.previous_billing_date),
    current_end: seconds(entity.next_billing_date),
    charge_at: live ? seconds(entity.next_billing_date) : null,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Webhooks (Standard Webhooks: HMAC-SHA256 over "id.timestamp.body", base64, with a whsec_ secret)
 * ---------------------------------------------------------------------------------------------- */

const WEBHOOK_TOLERANCE_S = 5 * 60;

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Checks Dodo's signature on a webhook body, and that it is recent (a replayed old message is refused). */
export async function isValidDodoWebhook(env: Env, rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }): Promise<boolean> {
  const secret = env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const timestamp = Number.parseInt(headers.timestamp, 10);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_S) return false;
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret);
  } catch {
    console.error("DODO_PAYMENTS_WEBHOOK_KEY is not a valid webhook secret");
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = bytesToBase64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headers.id}.${timestamp}.${rawBody}`)));
  const encoder = new TextEncoder();
  const want = encoder.encode(expected);
  // The header can carry several signatures ("v1,abc v1,def") while a secret is being rotated.
  return headers.signature.split(" ").some((part) => {
    const [version, signature] = part.split(",");
    if (version !== "v1" || !signature) return false;
    const got = encoder.encode(signature);
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= (got[i] ?? 0) ^ (want[i] ?? 0);
    return diff === 0;
  });
}
