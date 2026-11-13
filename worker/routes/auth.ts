import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AuthConfigResponse, MeResponse } from "../../shared/types";
import { timingSafeEqual } from "../lib/crypto";
import { forbidden, notFound } from "../lib/errors";
import { GoogleAuthError, createAuthorization, exchangeCode, isGoogleConfigured } from "../lib/google";
import { appOrigin, isHttps, isLocalhost, safeRedirectPath } from "../lib/request";
import { createSession, csrfTokenFor, destroySession, purgeExpiredSessions } from "../lib/session";
import { rateLimit } from "../middleware/rate-limit";
import { ensureWorkspace, upsertGoogleUser } from "../services/users";
import { toMembershipDTO, toSessionUser, toWorkspaceDTO } from "../services/workspaces";
import type { AppEnv } from "../types";

const STATE_COOKIE = "aos_oauth_state";
const VERIFIER_COOKIE = "aos_oauth_verifier";
const NEXT_COOKIE = "aos_oauth_next";
const OAUTH_COOKIE_PATH = "/api/auth";
const OAUTH_COOKIE_MAX_AGE = 10 * 60;

function setOAuthCookie(c: Context<AppEnv>, name: string, value: string) {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax", // must be Lax (not Strict) so it survives the top-level redirect back from Google
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
}

function clearOAuthCookies(c: Context<AppEnv>) {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NEXT_COOKIE]) {
    deleteCookie(c, name, { path: OAUTH_COOKIE_PATH, secure: isHttps(c) });
  }
}

/** True only under `npm run dev` on localhost – see the dev-login route at the bottom of this file. */
const devLoginEnabled = (c: Context<AppEnv>) => import.meta.env.DEV && isLocalhost(c);

const loginError = (c: Context<AppEnv>, code: string) => c.redirect(`/login?error=${encodeURIComponent(code)}`, 302);

export const authRoutes = new Hono<AppEnv>()
  // Brute-force / abuse throttle for everything under /api/auth (per IP).
  .use(rateLimit({ name: "auth", limit: 60, windowSeconds: 60 }))

  .get("/config", (c) => {
    const body: AuthConfigResponse = { googleConfigured: isGoogleConfigured(c.env), devLogin: devLoginEnabled(c) };
    return c.json(body);
  })

  /**
   * Current user + active workspace + CSRF token, or JSON `null` when signed out. (Deliberately 200
   * rather than 401: the SPA calls this on every public page to decide what to show.)
   */
  .get("/me", async (c) => {
    const auth = c.var.auth;
    if (!auth) return c.json(null);
    const body: MeResponse = {
      user: toSessionUser(auth.user),
      workspace: auth.workspace ? toWorkspaceDTO(auth.workspace) : null,
      membership: auth.member ? toMembershipDTO(auth.member) : null,
      csrfToken: await csrfTokenFor(c.env, auth.sessionId),
    };
    return c.json(body);
  })

  /** Step 1: redirect to Google's consent screen with state + PKCE. */
  .get("/google", (c) => {
    if (!isGoogleConfigured(c.env)) return loginError(c, "not_configured");

    const { url, state, codeVerifier } = createAuthorization(c.env, appOrigin(c));
    setOAuthCookie(c, STATE_COOKIE, state);
    setOAuthCookie(c, VERIFIER_COOKIE, codeVerifier);
    setOAuthCookie(c, NEXT_COOKIE, safeRedirectPath(c.req.query("next")));
    return c.redirect(url.toString(), 302);
  })

  /** Step 2: Google redirects back here with ?code&state. */
  .get("/google/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const storedState = getCookie(c, STATE_COOKIE);
    const codeVerifier = getCookie(c, VERIFIER_COOKIE);
    const next = safeRedirectPath(getCookie(c, NEXT_COOKIE));
    clearOAuthCookies(c);

    if (c.req.query("error")) return loginError(c, "access_denied");
    if (!code || !state || !storedState || !codeVerifier || !(await timingSafeEqual(state, storedState))) {
      return loginError(c, "invalid_state");
    }

    try {
      const profile = await exchangeCode(c.env, appOrigin(c), code, codeVerifier);
      const { user } = await upsertGoogleUser(c.var.db, profile);
      const workspaceId = await ensureWorkspace(c.var.db, user);
      await createSession(c, user.id, workspaceId);
      c.executionCtx.waitUntil(purgeExpiredSessions(c.var.db));
      return c.redirect(next, 302);
    } catch (error) {
      if (error instanceof GoogleAuthError) {
        console.warn("Google sign-in failed:", error.reason, error.message);
        return loginError(c, error.reason === "unverified_email" ? "unverified_email" : "google_failed");
      }
      console.error("Unexpected error during Google sign-in", error);
      return loginError(c, "server_error");
    }
  })

  .post("/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  });

/**
 * Local development only: sign in as the demo user without Google.
 *
 * The route is registered inside an `import.meta.env.DEV` block, which Vite replaces with `false` in
 * production builds — the bundler then drops this whole block, so the endpoint does not exist in a
 * deployed Worker. Under `npm run dev` it additionally requires a localhost hostname.
 */
if (import.meta.env.DEV) {
  authRoutes.post("/dev-login", async (c) => {
    if (!isLocalhost(c)) throw notFound("Route");
    if (c.var.auth) throw forbidden("Already signed in.");

    const { user } = await upsertGoogleUser(c.var.db, {
      sub: "dev:demo",
      email: "demo@agencyos.local",
      name: "Demo Owner",
      picture: null,
    });
    const workspaceId = await ensureWorkspace(c.var.db, user);
    await createSession(c, user.id, workspaceId);
    return c.json({ ok: true });
  });
}
