import { hmacSha256Hex, timingSafeEqual } from "./crypto";
import { ApiError } from "./errors";

/** Payments are switched on only once both API keys are present. */
export const isBillingConfigured = (env: Env): boolean => Boolean(env.RAZORPAY_KEY_ID?.trim() && env.RAZORPAY_KEY_SECRET?.trim());

/** The part of a Razorpay payment link we rely on. */
export interface PaymentLink {
  id: string;
  short_url: string;
  status: "created" | "partially_paid" | "paid" | "cancelled" | "expired";
  /** Paise. */
  amount: number;
  amount_paid: number;
  currency: string;
  reference_id?: string;
  payments?: { payment_id: string; status: string }[] | null;
}

const LINK_ID = /^plink_[A-Za-z0-9]{6,40}$/;
export const isPaymentLinkId = (value: string): boolean => LINK_ID.test(value);

const unavailable = () => new ApiError(502, "payment_provider_error", "We couldn't reach the payment service. Please try again in a minute.");

async function call<T>(env: Env, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!isBillingConfigured(env)) throw new ApiError(503, "billing_not_configured", "Online payments are not switched on yet.");
  // Local development only: tests talk to a stub instead of Razorpay.
  const origin = import.meta.env.DEV && env.RAZORPAY_TEST_ORIGIN ? env.RAZORPAY_TEST_ORIGIN : "https://api.razorpay.com";
  let response: Response;
  try {
    response = await fetch(`${origin}/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID?.trim()}:${env.RAZORPAY_KEY_SECRET?.trim()}`)}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("Razorpay request failed", { path, error });
    throw unavailable();
  }
  if (!response.ok) {
    // The body can describe the problem (e.g. wrong keys) but never contains our secret.
    console.error("Razorpay answered with an error", { path, status: response.status, body: (await response.text()).slice(0, 500) });
    throw unavailable();
  }
  return (await response.json()) as T;
}

interface NewPaymentLink {
  /** Paise. */
  amount: number;
  description: string;
  /** Our own id for the payment; Razorpay requires it to be unique. */
  referenceId: string;
  customer: { name: string; email: string };
  /** Where Razorpay sends the payer afterwards. */
  callbackUrl: string;
  /** Seconds since the epoch. */
  expireBy: number;
  notes: Record<string, string>;
}

/** Creates a hosted Razorpay payment page for one fixed amount. */
export function createPaymentLink(env: Env, input: NewPaymentLink): Promise<PaymentLink> {
  return call<PaymentLink>(env, "POST", "/payment_links", {
    amount: input.amount,
    currency: "INR",
    accept_partial: false,
    description: input.description,
    reference_id: input.referenceId,
    customer: input.customer,
    // We show our own confirmation; Razorpay still e-mails its payment receipt.
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: input.notes,
    callback_url: input.callbackUrl,
    callback_method: "get",
    expire_by: input.expireBy,
  });
}

/** Reads a payment link straight from Razorpay – the only source we trust for "has this been paid?". */
export function fetchPaymentLink(env: Env, linkId: string): Promise<PaymentLink> {
  if (!isPaymentLinkId(linkId)) throw new ApiError(400, "bad_request", "Unknown payment.");
  return call<PaymentLink>(env, "GET", `/payment_links/${linkId}`);
}

/** Razorpay signs each webhook body with the secret entered when the webhook was added. */
export async function isValidWebhookSignature(env: Env, rawBody: string, signature: string | undefined): Promise<boolean> {
  const secret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  return timingSafeEqual(await hmacSha256Hex(secret, rawBody), signature.trim().toLowerCase());
}
