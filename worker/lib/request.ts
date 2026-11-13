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

/** Client IP as reported by Cloudflare. Falls back to a constant locally (no CF edge in front). */
export function clientIp(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") ?? "127.0.0.1";
}

export function userAgent(c: Context<AppEnv>): string | null {
  return c.req.header("User-Agent")?.slice(0, 512) ?? null;
}

/**
 * Only allow same-site relative paths as post-login redirects (prevents open redirects):
 * must start with a single "/" and must not be protocol-relative or contain a backslash.
 */
export function safeRedirectPath(value: string | undefined | null, fallback = "/app"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (value.startsWith("/api/")) return fallback;
  return value;
}
