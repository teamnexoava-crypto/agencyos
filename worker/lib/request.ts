import type { Context } from "hono";
import type { AppEnv } from "../types";

/** Canonical origin of the app: APP_URL if configured, otherwise the origin the request arrived on. */
export function appOrigin(c: Context<AppEnv>): string {
  const configured = c.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(c.req.url).origin;
}

export function isHttps(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export function isLocalhost(c: Context<AppEnv>): boolean {
  const { hostname } = new URL(c.req.url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * The visitor's country (ISO 3166 code, e.g. "IN") as Cloudflare's edge reports it, or null when not
 * known. Under `npm run dev` on localhost there is no edge, so it comes from a `dev_country` cookie
 * (handy for trying the dollar prices) and is otherwise null, which counts as India.
 */
export function visitorCountry(c: Context<AppEnv>): string | null {
  if (import.meta.env.DEV && isLocalhost(c)) {
    const cookie = /(?:^|;\s*)dev_country=([A-Za-z]{2})/.exec(c.req.header("Cookie") ?? "");
    return cookie?.[1]?.toUpperCase() ?? null;
  }
  const country: unknown = (c.req.raw as Request & { cf?: { country?: unknown } }).cf?.country;
  return typeof country === "string" && country ? country : null;
}

/** Client IP as reported by Cloudflare. Falls back to a constant locally (no CF edge in front). */
export function clientIp(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") ?? "127.0.0.1";
}

export function userAgent(c: Context<AppEnv>): string | null {
  return c.req.header("User-Agent")?.slice(0, 512) ?? null;
}

/**
 * Only allow same-site relative paths as post-login redirects (prevents open redirects): must start
 * with a single "/", must not be protocol-relative, and must not contain a backslash, whitespace or
 * control characters (browsers drop tabs and newlines from addresses, so "/\t/evil.com" would become
 * "//evil.com"). As a last check, the path must stay on our own origin when resolved.
 */
export function safeRedirectPath(value: string | undefined | null, fallback = "/app"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007F-\u00A0\u2028\u2029]/.test(value)) return fallback;
  if (value.startsWith("/api/")) return fallback;
  try {
    if (new URL(value, "https://same.invalid").origin !== "https://same.invalid") return fallback;
  } catch {
    return fallback;
  }
  return value;
}

const utcDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/**
 * "Today" where the person is. The browser sends its calendar date in `X-Local-Date`; it is used only
 * when it is yesterday, today or tomorrow by the server's own clock (every real time zone falls in
 * that window), so the header can't be used to shift reports to an arbitrary date.
 */
export function localToday(c: Context<AppEnv>): string {
  const sent = c.req.header("X-Local-Date") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(sent) && sent >= utcDay(-1) && sent <= utcDay(1) ? sent : utcDay();
}
