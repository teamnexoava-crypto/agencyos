/**
 * Secrets, which are deliberately absent from wrangler.jsonc (so `wrangler types` cannot emit them
 * on a machine without .dev.vars, e.g. CI). Set them with `wrangler secret put` or in the dashboard.
 */
interface Env {
  /** Google OAuth 2.0 client (Google Cloud Console → Credentials). */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** 32+ random bytes; keys the CSRF token HMAC. */
  SESSION_SECRET: string;
  /**
   * Razorpay API keys (Razorpay Dashboard → Account & Settings → API keys) and the secret chosen when
   * adding the webhook. Until the first two are set, payments are off and nobody is limited or locked.
   */
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  /** Local development only: origin of a stub standing in for api.razorpay.com. */
  RAZORPAY_TEST_ORIGIN?: string;
  /**
   * Dodo Payments (dashboard → Developer → API keys / Webhooks): takes payments outside India, in US
   * dollars. Until the API key is set, workspaces outside India are not limited or locked.
   * `DODO_PAYMENTS_ENVIRONMENT` (a plain variable in wrangler.jsonc) picks test or live mode.
   */
  DODO_PAYMENTS_API_KEY?: string;
  DODO_PAYMENTS_WEBHOOK_KEY?: string;
  /** Local development only: origin of a stub standing in for Dodo's API. */
  DODO_TEST_ORIGIN?: string;
  /**
   * Resend (resend.com → API Keys): sends the welcome, reminder and failed-payment emails. Until it
   * is set, no email is sent. The sender is EMAIL_FROM (a plain variable in wrangler.jsonc), whose
   * domain must be verified in Resend.
   */
  RESEND_API_KEY?: string;
  /** Local development only: origin of a stub standing in for api.resend.com. */
  EMAIL_TEST_ORIGIN?: string;
  /** Local development only: origin of a stub that serves sheet CSV (the real one is docs.google.com). */
  SHEETS_TEST_ORIGIN?: string;
}
