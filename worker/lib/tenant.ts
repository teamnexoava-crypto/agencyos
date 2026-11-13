import type { Context } from "hono";
import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { FINANCE_ROLES, type Role } from "../../shared/constants";
import type { AppEnv, AuthContext, WorkspaceContext } from "../types";
import { forbidden, unauthorized } from "./errors";

/** Returns the authenticated caller or throws 401. */
export function requireUser(c: Context<AppEnv>): AuthContext {
  const auth = c.var.auth;
  if (!auth) throw unauthorized();
  return auth;
}

/**
 * The single entry point for touching tenant data.
 *
 * Route handlers never read a workspace id from the URL, body or query string. They call `tenant(c)`,
 * which derives the workspace from the server-side session, and build every WHERE clause with
 * `t.where(table, ...)` so the `workspace_id = ?` predicate cannot be forgotten:
 *
 *   const t = tenant(c);
 *   const rows = await t.db.select().from(clients).where(t.where(clients, isNull(clients.deletedAt)));
 *   await t.db.insert(clients).values({ ...input, workspaceId: t.workspaceId });
 */
export function tenant(c: Context<AppEnv>) {
  const auth = requireUser(c);
  if (!auth.workspace || !auth.member) {
    throw forbidden("You are not a member of any workspace.", "no_workspace");
  }
  const ctx: WorkspaceContext = { ...auth, workspace: auth.workspace, member: auth.member, role: auth.member.role };
  const workspaceId = ctx.workspace.id;

  return {
    ...ctx,
    db: c.var.db,
    workspaceId,
    /** Builds `workspace_id = <current> AND ...conditions` for a tenant-owned table. */
    where<T extends { workspaceId: PgColumn }>(table: T, ...conditions: (SQL | undefined)[]): SQL {
      // `and()` only returns undefined when given no conditions; we always pass at least one.
      return and(eq(table.workspaceId, workspaceId), ...conditions) as SQL;
    },
    /** True for owner/admin – the only roles allowed to see financial data. */
    canSeeFinance: FINANCE_ROLES.includes(ctx.role),
    /** Throws 403 unless the caller has one of the given roles. */
    requireRole(...roles: Role[]) {
      if (!roles.includes(ctx.role)) throw forbidden();
    },
  };
}

export type Tenant = ReturnType<typeof tenant>;
