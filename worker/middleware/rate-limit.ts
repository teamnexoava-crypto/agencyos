import { createMiddleware } from "hono/factory";
import { tooManyRequests } from "../lib/errors";
import { clientIp } from "../lib/request";
import type { AppEnv } from "../types";

type LimiterName = "AUTH_LIMITER" | "PUBLIC_LIMITER";

/**
 * Per-IP rate limiting with Cloudflare's native Rate Limiting binding (limits are configured in
 * wrangler.jsonc). Counters live at the edge location handling the request, so the limit is enforced
 * per location rather than globally — exactly what is wanted for throttling abuse, with no storage
 * writes and nothing to clean up.
 */
export function rateLimit(limiter: LimiterName) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { success } = await c.env[limiter].limit({ key: clientIp(c) });
    if (!success) {
      c.header("Retry-After", "60");
      throw tooManyRequests();
    }
    await next();
  });
}
