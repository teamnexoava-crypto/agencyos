import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import { unauthorized } from "../lib/errors";
import { loadAuthContext } from "../lib/session";
import type { AppEnv } from "../types";

/**
 * Attaches a per-request Drizzle client and (if a valid session cookie is present) the caller's
 * AuthContext. The database connection is released once the response and any `waitUntil()` work
 * that has already issued its queries are done.
 */
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const db = createDb(c.env.HYPERDRIVE.connectionString);
  c.set("db", db);
  try {
    c.set("auth", await loadAuthContext(c));
    await next();
  } finally {
    // `end()` lets in-flight queries finish (up to 5s) before closing the sockets.
    c.executionCtx.waitUntil(db.$client.end({ timeout: 5 }));
  }
});

/** Rejects unauthenticated requests. Mount on every private route group. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.auth) throw unauthorized();
  await next();
});
