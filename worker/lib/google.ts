/**
 * Google OAuth 2.0 (authorization code + PKCE) — the only place that talks to the `arctic` library,
 * so the provider client can be swapped without touching the routes.
 */
import { ArcticFetchError, Google, OAuth2RequestError, decodeIdToken, generateCodeVerifier, generateState } from "arctic";

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export class GoogleAuthError extends Error {
  readonly reason: "denied" | "invalid" | "unverified_email" | "network";
  constructor(reason: GoogleAuthError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

/** True once all three secrets are present – until then sign-in is switched off rather than half-working. */
export function isGoogleConfigured(env: Env): boolean {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET) return false;
  return !env.GOOGLE_CLIENT_ID.startsWith("local-placeholder");
}

const redirectUri = (origin: string) => `${origin}/api/auth/google/callback`;

export function createAuthorization(env: Env, origin: string) {
  const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri(origin));
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
  // Always show the account chooser so shared devices don't silently reuse the last account.
  url.searchParams.set("prompt", "select_account");
  return { url, state, codeVerifier };
}

function claim(claims: object, key: string): unknown {
  return (claims as Record<string, unknown>)[key];
}

export async function exchangeCode(env: Env, origin: string, code: string, codeVerifier: string): Promise<GoogleProfile> {
  const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri(origin));

  let claims: object;
  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    // The ID token arrives directly from Google's token endpoint over TLS, authenticated with our client
    // secret, so (per OpenID Connect Core §3.1.3.7) its signature need not be re-verified. Claims still are.
    claims = decodeIdToken(tokens.idToken());
  } catch (error) {
    if (error instanceof OAuth2RequestError) throw new GoogleAuthError("invalid", `Google rejected the code: ${error.code}`);
    if (error instanceof ArcticFetchError) throw new GoogleAuthError("network", "Could not reach Google.");
    throw new GoogleAuthError("invalid", "Could not validate the Google sign-in response.");
  }

  const iss = claim(claims, "iss");
  const aud = claim(claims, "aud");
  const exp = claim(claims, "exp");
  const sub = claim(claims, "sub");
  const email = claim(claims, "email");
  const name = claim(claims, "name");
  const picture = claim(claims, "picture");

  if (typeof iss !== "string" || !GOOGLE_ISSUERS.has(iss)) throw new GoogleAuthError("invalid", "Unexpected token issuer.");
  if (aud !== env.GOOGLE_CLIENT_ID) throw new GoogleAuthError("invalid", "Token was issued for a different client.");
  if (typeof exp !== "number" || exp * 1000 < Date.now()) throw new GoogleAuthError("invalid", "Token has expired.");
  if (typeof sub !== "string" || typeof email !== "string") throw new GoogleAuthError("invalid", "Token is missing identity claims.");
  if (claim(claims, "email_verified") !== true) {
    throw new GoogleAuthError("unverified_email", "Your Google email address is not verified.");
  }

  return {
    sub,
    email: email.toLowerCase(),
    name: typeof name === "string" && name.trim() ? name.trim() : (email.split("@")[0] ?? email),
    picture: typeof picture === "string" ? picture : null,
  };
}
