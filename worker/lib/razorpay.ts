import type { SubscriptionStatus } from "../../shared/plans";
import { hmacSha256Hex, timingSafeEqual } from "./crypto";
import { ApiError } from "./errors";

/** Payments are switched on only once both API keys are present. */
export const isBillingConfigured = (env: Env): boolean => Boolean(env.RAZORPAY_KEY_ID?.trim() && env.RAZORPAY_KEY_SECRET?.trim());

/** Whether payments are off, or on with Razorpay's test keys (no real money) or live keys. Not a secret. */
export function paymentsMode(env: Env): "off" | "test" | "live" {
  if (!isBillingConfigured(env)) return "off";
  return env.RAZORPAY_KEY_ID?.trim().startsWith("rzp_test_") ? "test" : "live";
}

/**
 * A failed call to Razorpay. To the person it is always the same "try again" message; `providerStatus`
 * is for our own code, which sometimes needs to tell "Razorpay said no" (4xx) from "couldn't ask" (0).
 */
export class RazorpayError extends ApiError {
  /** HTTP status Razorpay answered with, or 0 when it could not be reached. */
  readonly providerStatus: number;

  constructor(providerStatus: number) {
    super(502, "payment_provider_error", "We couldn't reach the payment service. Please try again in a minute.");
    this.providerStatus = providerStatus;
  }

  /** Razorpay answers 400/404 for an id that does not exist under these keys, or an action its state doesn't allow. */
  get rejected(): boolean {
    return this.providerStatus === 400 || this.providerStatus === 404;
  }
}

async function call<T>(env: Env, method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
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
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    console.error("Razorpay request failed", { path, error });
    throw new RazorpayError(0);
  }
  if (!response.ok) {
    // The body can describe the problem (e.g. wrong keys) but never contains our secret.
    console.error("Razorpay answered with an error", { path, status: response.status, body: (await response.text()).slice(0, 500) });
    throw new RazorpayError(response.status);
  }
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------------------------------------
 * Payment links: one-off payments on Razorpay's hosted page
 * ---------------------------------------------------------------------------------------------- */

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

interface NewPaymentLink {
  /** Paise. */
  amount: number;
  description: string;
  /** Our own id for the payment; Razorpay requires it to be unique. */
  referenceId: string;
  /** Used to send Razorpay's receipt. (No name: Razorpay is strict about what a name may contain.) */
  customer: { email: string };
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
export function fetchPaymentLink(env: Env, linkId: string, timeoutMs?: number): Promise<PaymentLink> {
  if (!isPaymentLinkId(linkId)) throw new ApiError(400, "bad_request", "Unknown payment.");
  return call<PaymentLink>(env, "GET", `/payment_links/${linkId}`, undefined, timeoutMs);
}

/* ------------------------------------------------------------------------------------------------
 * Subscriptions: monthly auto-pay (UPI AutoPay or a card mandate)
 * ---------------------------------------------------------------------------------------------- */

/** The part of a Razorpay subscription we rely on. Times are seconds since the epoch. */
export interface ProviderSubscription {
  id: string;
  plan_id: string;
  status: SubscriptionStatus;
  /** Razorpay's page where the payer approves the mandate. */
  short_url?: string | null;
  /** Successful charges so far. */
  paid_count: number;
  /** When billing started (or is due to start). */
  start_at: number | null;
  /** The billing cycle Razorpay is in. */
  current_start: number | null;
  current_end: number | null;
  /** When the next charge is due. */
  charge_at: number | null;
}

const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{6,40}$/;
export const isSubscriptionId = (value: unknown): value is string => typeof value === "string" && SUBSCRIPTION_ID.test(value);

/** A Razorpay plan is the fixed "this much, every month" that a subscription bills. Returns its id. */
export async function createProviderPlan(env: Env, input: { name: string; amount: number; period: "monthly" | "yearly" }): Promise<string> {
  const plan = await call<{ id: string }>(env, "POST", "/plans", {
    period: input.period,
    interval: 1,
    item: { name: input.name, amount: input.amount, currency: "INR" },
  });
  return plan.id;
}

interface NewSubscription {
  providerPlanId: string;
  /** How many cycles the mandate covers. */
  totalCount: number;
  /** Seconds since the epoch. Omit to charge the first cycle as soon as the mandate is approved. */
  startAt?: number;
  /** The payer must approve the mandate by this time (seconds since the epoch). */
  expireBy: number;
  notes: Record<string, string>;
}

export function createSubscription(env: Env, input: NewSubscription): Promise<ProviderSubscription> {
  // Everything else is left at Razorpay's defaults: one unit of the plan per charge, and Razorpay
  // itself sends the payer the notices about the mandate and each charge.
  return call<ProviderSubscription>(env, "POST", "/subscriptions", {
    plan_id: input.providerPlanId,
    total_count: input.totalCount,
    ...(input.startAt === undefined ? {} : { start_at: input.startAt }),
    expire_by: input.expireBy,
    notes: input.notes,
  });
}

/** Reads a subscription straight from Razorpay – the only source we trust for its status and charges. */
export function fetchSubscription(env: Env, subscriptionId: string, timeoutMs?: number): Promise<ProviderSubscription> {
  if (!isSubscriptionId(subscriptionId)) throw new ApiError(400, "bad_request", "Unknown subscription.");
  return call<ProviderSubscription>(env, "GET", `/subscriptions/${subscriptionId}`, undefined, timeoutMs);
}

/** Stops a subscription now: no further charges are taken. Cannot be undone. */
export function cancelProviderSubscription(env: Env, subscriptionId: string): Promise<ProviderSubscription> {
  if (!isSubscriptionId(subscriptionId)) throw new ApiError(400, "bad_request", "Unknown subscription.");
  return call<ProviderSubscription>(env, "POST", `/subscriptions/${subscriptionId}/cancel`, { cancel_at_cycle_end: 0 });
}

/* ------------------------------------------------------------------------------------------------
 * Webhooks
 * ---------------------------------------------------------------------------------------------- */

/** Razorpay signs each webhook body with the secret entered when the webhook was added. */
export async function isValidWebhookSignature(env: Env, rawBody: string, signature: string | undefined): Promise<boolean> {
  const secret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  return timingSafeEqual(await hmacSha256Hex(secret, rawBody), signature.trim().toLowerCase());
}
