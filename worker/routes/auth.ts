import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AuthConfigResponse, MeResponse } from "../../shared/types";
import { users } from "../db/schema";
import { timingSafeEqual } from "../lib/crypto";
import { forbidden, notFound } from "../lib/errors";
import { GoogleAuthError, createAuthorization, exchangeCode, isGoogleConfigured } from "../lib/google";
import { appOrigin, isHttps, isLocalhost, safeRedirectPath } from "../lib/request";
import { createSession, csrfTokenFor, destroySession, purgeExpiredSessions } from "../lib/session";
import { rateLimit } from "../middleware/rate-limit";
import { billingOf } from "../services/billing";
import { ensureWorkspace, findWorkspaceId, upsertGoogleUser } from "../services/users";
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
  // These two are read on every page load (and on public pages), so they get the generous limit:
  // a whole office behind one IP address must never be locked out of the app by ordinary browsing.
  .get("/config", rateLimit("PUBLIC_LIMITER"), (c) => {
    const body: AuthConfigResponse = { googleConfigured: isGoogleConfigured(c.env), devLogin: devLoginEnabled(c) };
    return c.json(body);
  })

  /**
   * Current user + active workspace + CSRF token, or JSON `null` when signed out. (Deliberately 200
   * rather than 401: the SPA calls this on every public page to decide what to show.)
   */
  .get("/me", rateLimit("PUBLIC_LIMITER"), async (c) => {
    const auth = c.var.auth;
    if (!auth) return c.json(null);
    const body: MeResponse = {
      user: toSessionUser(auth.user),
      workspace: auth.workspace ? toWorkspaceDTO(auth.workspace) : null,
      membership: auth.member ? toMembershipDTO(auth.member) : null,
      billing: auth.workspace ? billingOf(c.env, auth.workspace) : null,
      csrfToken: await csrfTokenFor(c.env, auth.sessionId),
    };
    return c.json(body);
  })

  // Brute-force / abuse throttle for the sign-in flow itself (per IP). Registered here so it covers
  // only the routes below.
  .use(rateLimit("AUTH_LIMITER"))

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
      // Someone signing in to accept an invite joins that workspace instead – don't create one of their own.
      const workspaceId = next.startsWith("/invite/") ? await findWorkspaceId(c.var.db, user) : await ensureWorkspace(c.var.db, user);
      await createSession(c, user.id, workspaceId);
      c.var.defer(purgeExpiredSessions(c.var.db));
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
  /**
   * Body (optional): `{ "email": "diya@agencyos.local" }` signs in as that seeded teammate, which is
   * how roles and tenant isolation are tested locally. An unknown email creates a brand-new dev user
   * with their own workspace. With no body you are the demo owner.
   */
  authRoutes.post("/dev-login", async (c) => {
    if (!isLocalhost(c)) throw notFound("Route");
    if (c.var.auth) throw forbidden("Already signed in.");

    const body: unknown = await c.req.json().catch(() => null);
    const requested = typeof body === "object" && body !== null && "email" in body ? String(body.email).toLowerCase() : null;
    const email = requested && /^[\w.+-]+@agencyos\.local$/.test(requested) ? requested : "demo@agencyos.local";
    const handle = email.split("@")[0] ?? "demo";

    const [existing] = await c.var.db.select().from(users).where(eq(users.email, email)).limit(1);
    const user =
      existing ??
      (
        await upsertGoogleUser(c.var.db, {
          sub: `dev:${handle}`,
          email,
          name: handle === "demo" ? "Demo Owner" : `${handle.charAt(0).toUpperCase()}${handle.slice(1)} Tester`,
          picture: null,
        })
      ).user;
    // `{ "workspace": false }` mimics signing in from an invite link: no workspace is created.
    const skipWorkspace = typeof body === "object" && body !== null && "workspace" in body && body.workspace === false;
    const workspaceId = skipWorkspace ? await findWorkspaceId(c.var.db, user) : await ensureWorkspace(c.var.db, user);
    await createSession(c, user.id, workspaceId);
    return c.json({ ok: true });
  });
}
