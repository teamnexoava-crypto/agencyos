import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, isNull, lt } from "drizzle-orm";
import { SESSION_REFRESH_THRESHOLD_MS, SESSION_TTL_MS } from "../../shared/constants";
import type { Database } from "../db";
import { sessions, users, workspaceMembers, workspaces } from "../db/schema";
import type { AppEnv, AuthContext, MemberRow, WorkspaceRow } from "../types";
import { hmacSha256Hex, randomToken, sha256Hex } from "./crypto";
import { clientIp, isHttps, userAgent } from "./request";

export const SESSION_COOKIE = "aos_session";

function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    // `Secure` cookies are rejected over plain http by some browsers, so only drop it for local http dev.
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isHttps(c) });
}

/** The database only ever sees a hash of the cookie token, so a database leak cannot be replayed as a login. */
const sessionIdFromToken = (token: string) => sha256Hex(token);

export async function createSession(c: Context<AppEnv>, userId: string, activeWorkspaceId: string | null) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await c.var.db.insert(sessions).values({
    id: await sessionIdFromToken(token),
    userId,
    activeWorkspaceId,
    expiresAt,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });
  setSessionCookie(c, token, expiresAt);
}

export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.var.db.delete(sessions).where(eq(sessions.id, await sessionIdFromToken(token)));
  }
  clearSessionCookie(c);
}

/** Finds the user's membership in `workspaceId`, or their oldest remaining membership as a fallback. */
async function resolveMembership(
  db: Database,
  userId: string,
  workspaceId: string | null,
): Promise<{ workspace: WorkspaceRow; member: MemberRow } | null> {
  const rows = await db
    .select({ workspace: workspaces, member: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), isNull(workspaceMembers.removedAt), isNull(workspaces.deletedAt)))
    .orderBy(workspaceMembers.createdAt);
  return rows.find((r) => r.workspace.id === workspaceId) ?? rows[0] ?? null;
}

/**
 * Resolves the session cookie into an AuthContext.
 * - Expired / unknown sessions clear the cookie and return null.
 * - Sessions are "rolling": once less than half the lifetime remains, expiry is pushed out another 30 days.
 */
export async function loadAuthContext(c: Context<AppEnv>): Promise<AuthContext | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const db = c.var.db;
  const sessionId = await sessionIdFromToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) {
    clearSessionCookie(c);
    return null;
  }

  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    clearSessionCookie(c);
    return null;
  }

  const membership = await resolveMembership(db, row.user.id, row.session.activeWorkspaceId);
  const activeWorkspaceId = membership?.workspace.id ?? null;

  const needsRefresh = row.session.expiresAt.getTime() - now < SESSION_REFRESH_THRESHOLD_MS;
  if (needsRefresh || activeWorkspaceId !== row.session.activeWorkspaceId) {
    const expiresAt = needsRefresh ? new Date(now + SESSION_TTL_MS) : row.session.expiresAt;
    await db.update(sessions).set({ expiresAt, activeWorkspaceId }).where(eq(sessions.id, sessionId));
    if (needsRefresh) setSessionCookie(c, token, expiresAt);
  }

  return {
    sessionId,
    user: row.user,
    workspace: membership?.workspace ?? null,
    member: membership?.member ?? null,
  };
}

export async function setActiveWorkspace(db: Database, sessionId: string, workspaceId: string) {
  await db.update(sessions).set({ activeWorkspaceId: workspaceId }).where(eq(sessions.id, sessionId));
}

/** CSRF token bound to the session: HMAC(SESSION_SECRET, "csrf:" + sessionId). Stateless to verify. */
export function csrfTokenFor(env: Env, sessionId: string): Promise<string> {
  return hmacSha256Hex(env.SESSION_SECRET, `csrf:${sessionId}`);
}

/** Housekeeping: remove expired sessions (run opportunistically after logins). */
export async function purgeExpiredSessions(db: Database) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
