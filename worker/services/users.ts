import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db";
import { users, workspaceMembers, workspaces } from "../db/schema";
import type { GoogleProfile } from "../lib/google";
import type { BillingCurrency } from "../../shared/plans";
import type { UserRow } from "../types";
import { createWorkspaceForUser, defaultWorkspaceName } from "./workspaces";

/**
 * Finds the user for a Google identity (matching on the stable `sub`), creating it on first login.
 * Name / avatar / email are refreshed from Google on every login.
 */
export async function upsertGoogleUser(db: Database, profile: GoogleProfile): Promise<{ user: UserRow; isNew: boolean }> {
  const [existing] = await db.select().from(users).where(eq(users.googleSub, profile.sub)).limit(1);

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({ email: profile.email, name: profile.name, avatarUrl: profile.picture })
      .where(eq(users.id, existing.id))
      .returning();
    return { user: updated ?? existing, isNew: false };
  }

  const [created] = await db
    .insert(users)
    .values({ googleSub: profile.sub, email: profile.email, name: profile.name, avatarUrl: profile.picture })
    .returning();
  if (!created) throw new Error("Failed to create user");
  return { user: created, isNew: true };
}

/**
 * Makes sure the user has somewhere to land: returns their first workspace id, creating a fresh
 * workspace (which they own) if they have none. Invite acceptance (Phase 3) runs before this.
 */
export async function ensureWorkspace(db: Database, user: UserRow, billingCurrency: BillingCurrency): Promise<string> {
  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id))
    .orderBy(workspaceMembers.createdAt)
    .limit(1);
  if (membership) return membership.workspaceId;
  return createWorkspaceForUser(db, user, { name: defaultWorkspaceName(user.name), billingCurrency });
}

/** The user's first active workspace, or null – used when signing in to accept an invite (no workspace is created). */
export async function findWorkspaceId(db: Database, user: UserRow): Promise<string | null> {
  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, user.id), isNull(workspaceMembers.removedAt), isNull(workspaces.deletedAt)))
    .orderBy(workspaceMembers.createdAt)
    .limit(1);
  return membership?.workspaceId ?? null;
}
