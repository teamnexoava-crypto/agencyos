import { ApiError } from "./errors";

/**
 * A failed call to a payment provider (Razorpay or Dodo Payments). To the person it is always the same
 * "try again" message; `providerStatus` is for our own code, which sometimes needs to tell "the provider
 * said no" (4xx) from "couldn't ask" (0).
 */
export class PaymentProviderError extends ApiError {
  /** HTTP status the provider answered with, or 0 when it could not be reached. */
  readonly providerStatus: number;

  constructor(providerStatus: number) {
    super(502, "payment_provider_error", "We couldn't reach the payment service. Please try again in a minute.");
    this.providerStatus = providerStatus;
  }

  /** 400/404: an id that does not exist under these keys, or an action its state doesn't allow. */
  get rejected(): boolean {
    return this.providerStatus === 400 || this.providerStatus === 404;
  }
}
