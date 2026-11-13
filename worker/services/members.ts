import { and, eq, inArray, isNull } from "drizzle-orm";
import type { MemberSummary } from "../../shared/types";
import type { Database } from "../db";
import { users, workspaceMembers } from "../db/schema";
import { ApiError } from "../lib/errors";

/** Active members of a workspace. Cost fields are deliberately not selected here. */
export async function listMembers(db: Database, workspaceId: string): Promise<MemberSummary[]> {
  const rows = await db
    .select({
      id: workspaceMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: workspaceMembers.role,
      designation: workspaceMembers.designation,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), isNull(workspaceMembers.removedAt)))
    .orderBy(workspaceMembers.createdAt);
  return rows;
}

/**
 * Verifies that every id is an active member of THIS workspace – ids arriving from the client are
 * never trusted to belong to the caller's tenant. Returns the matching rows (id + userId).
 */
export async function requireMembers(db: Database, workspaceId: string, memberIds: string[]) {
  const unique = [...new Set(memberIds)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: workspaceMembers.id, userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), isNull(workspaceMembers.removedAt), inArray(workspaceMembers.id, unique)));
  if (rows.length !== unique.length) {
    throw new ApiError(400, "invalid_member", "One of the selected people is not a member of this workspace.");
  }
  return rows;
}
