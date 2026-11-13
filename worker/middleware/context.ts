import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import { unauthorized } from "../lib/errors";
import { loadAuthContext } from "../lib/session";
import type { AppEnv } from "../types";

/**
 * Attaches a per-request Drizzle client and (if a valid session cookie is present) the caller's
 * AuthContext.
 *
 * Work that should happen after the response (activity log, notifications, storage clean-up) goes
 * through `c.var.defer(promise)` rather than `executionCtx.waitUntil` directly: the database
 * connection is only closed once every deferred task has settled, so a task that runs several
 * queries in a row never finds the connection already gone.
 */
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const db = createDb(c.env.HYPERDRIVE.connectionString);
  const deferred: Promise<unknown>[] = [];
  c.set("db", db);
  c.set("defer", (task) => {
    deferred.push(
      task.catch((error: unknown) => {
        console.error("Deferred task failed", error);
      }),
    );
  });
  try {
    c.set("auth", await loadAuthContext(c));
    await next();
  } finally {
    c.executionCtx.waitUntil(
      (async () => {
        // A task may defer further tasks while it runs; array iteration picks up items added along the way.
        for (const task of deferred) await task;
        await db.$client.end({ timeout: 5 });
      })(),
    );
  }
});

/** Rejects unauthenticated requests. Mount on every private route group. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.auth) throw unauthorized();
  await next();
});
