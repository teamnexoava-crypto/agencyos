import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import { unauthorized } from "../lib/errors";
import { loadAuthContext } from "../lib/session";
import type { AppEnv } from "../types";

/** Attaches the Drizzle client and (if a valid session cookie is present) the caller's AuthContext. */
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", createDb(c.env.DB));
  c.set("auth", await loadAuthContext(c));
  await next();
});

/** Rejects unauthenticated requests. Mount on every private route group. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.auth) throw unauthorized();
  await next();
});
