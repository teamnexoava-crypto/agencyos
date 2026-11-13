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
}
