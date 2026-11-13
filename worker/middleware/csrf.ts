import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "../lib/crypto";
import { forbidden } from "../lib/errors";
import { appOrigin } from "../lib/request";
import { csrfTokenFor } from "../lib/session";
import type { AppEnv } from "../types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection for every state-changing request, in two layers:
 *  1. Origin check – the `Origin` header must be our own origin. Browsers always send it on
 *     cross-site POST/PUT/PATCH/DELETE, and pages cannot forge it.
 *  2. Session-bound token – authenticated requests must also send `X-CSRF-Token`, an HMAC of the
 *     session id that only our own frontend can read (via GET /api/auth/me, which is same-origin only).
 * On top of this the session cookie is SameSite=Lax, so it is not sent on cross-site subrequests at all.
 */
export const csrfProtection = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();

  const origin = c.req.header("Origin");
  const allowed = new Set([appOrigin(c), new URL(c.req.url).origin]);
  if (!origin || !allowed.has(origin)) {
    throw forbidden("Cross-site request blocked.", "csrf_origin");
  }

  const auth = c.var.auth;
  if (auth) {
    const sent = c.req.header("X-CSRF-Token") ?? "";
    const expected = await csrfTokenFor(c.env, auth.sessionId);
    if (!sent || !(await timingSafeEqual(sent, expected))) {
      throw forbidden("Your session security token is missing or stale. Refresh the page and try again.", "csrf_token");
    }
  }

  await next();
});
