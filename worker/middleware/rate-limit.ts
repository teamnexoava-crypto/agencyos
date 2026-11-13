import { createMiddleware } from "hono/factory";
import { tooManyRequests } from "../lib/errors";
import { clientIp } from "../lib/request";
import type { AppEnv } from "../types";

interface RateLimitOptions {
  /** Bucket name, e.g. "auth" or "public". */
  name: string;
  /** Max requests per window, per client IP. */
  limit: number;
  windowSeconds: number;
}

/**
 * Fixed-window rate limiter backed by Workers KV.
 *
 * KV is eventually consistent, so under a burst a few extra requests can slip through before the
 * counter propagates — acceptable for abuse throttling on auth and public-link routes (it is not a
 * billing-grade quota). Keys expire on their own, so there is nothing to clean up.
 */
export function rateLimit({ name, limit, windowSeconds }: RateLimitOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowIndex = Math.floor(nowSeconds / windowSeconds);
    const key = `rl:${name}:${clientIp(c)}:${windowIndex}`;

    const current = Number.parseInt((await c.env.KV.get(key)) ?? "0", 10) || 0;
    const resetIn = (windowIndex + 1) * windowSeconds - nowSeconds;

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, limit - current - 1)));

    if (current >= limit) {
      c.header("Retry-After", String(resetIn));
      throw tooManyRequests();
    }

    // KV requires expirationTtl >= 60s.
    c.executionCtx.waitUntil(c.env.KV.put(key, String(current + 1), { expirationTtl: Math.max(60, windowSeconds * 2) }));
    await next();
  });
}
