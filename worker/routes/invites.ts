import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { InvitePreview, InviteState } from "../../shared/types";
import { activityLog, invites, users, workspaceMembers, workspaces } from "../db/schema";
import { ApiError, notFound } from "../lib/errors";
import { setActiveWorkspace } from "../lib/session";
import { requireUser } from "../lib/tenant";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { notify } from "../services/activity";
import { logoUrlFromKey } from "../services/workspaces";
import type { AppEnv } from "../types";

const tokenParam = z.object({ token: z.string().regex(/^[\w-]{20,64}$/) });

type InviteRow = typeof invites.$inferSelect;

function stateOf(invite: InviteRow): InviteState {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= Date.now()) return "expired";
  return "valid";
}

/**
 * Invitation links (/invite/:token). These are the only team routes that are NOT scoped by the
 * caller's workspace – the unguessable token is what grants access – so they are rate-limited and
 * return a deliberately small set of fields.
 */
export const inviteRoutes = new Hono<AppEnv>()
  .use(rateLimit("PUBLIC_LIMITER"))

  /** What the invite page shows before the person signs in. */
  .get("/:token", validate("param", tokenParam), async (c) => {
    const db = c.var.db;
    const [row] = await db
      .select({ invite: invites, workspace: workspaces, inviterName: users.name })
      .from(invites)
      .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
      .leftJoin(workspaceMembers, eq(workspaceMembers.id, invites.invitedBy))
      .leftJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(invites.token, c.req.valid("param").token), isNull(workspaces.deletedAt)))
      .limit(1);

    const preview: InvitePreview = row
      ? {
          state: stateOf(row.invite),
          workspaceName: row.workspace.name,
          workspaceLogoUrl: logoUrlFromKey(row.workspace.logoKey),
          inviterName: row.inviterName,
          email: row.invite.email,
          role: row.invite.role,
        }
      : { state: "not_found", workspaceName: null, workspaceLogoUrl: null, inviterName: null, email: null, role: null };
    return c.json(preview);
  })

  /**
   * Joins the workspace. Requires a signed-in user whose Google email matches the invited address,
   * so a forwarded or leaked link cannot be used by someone else.
   */
  .post("/:token/accept", validate("param", tokenParam), async (c) => {
    const auth = requireUser(c);
    const db = c.var.db;

    const [row] = await db
      .select({ invite: invites, workspace: workspaces })
      .from(invites)
      .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
      .where(and(eq(invites.token, c.req.valid("param").token), isNull(workspaces.deletedAt)))
      .limit(1);
    if (!row) throw notFound("Invite");
    const { invite, workspace } = row;

    const state = stateOf(invite);
    if (state !== "valid") {
      const messages: Record<Exclude<InviteState, "valid" | "not_found">, string> = {
        expired: "This invite has expired. Ask for a new one.",
        revoked: "This invite was cancelled. Ask for a new one.",
        accepted: "This invite has already been used.",
      };
      throw new ApiError(410, `invite_${state}`, messages[state as keyof typeof messages]);
    }
    if (invite.email.toLowerCase() !== auth.user.email.toLowerCase()) {
      throw new ApiError(403, "email_mismatch", `This invite was sent to ${invite.email}, but you're signed in as ${auth.user.email}.`);
    }

    const memberId = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, auth.user.id)))
        .limit(1);

      let id: string;
      if (existing) {
        id = existing.id;
        // Previously removed → reinstate with the invited role. Already active → nothing to change.
        if (existing.removedAt) {
          await tx
            .update(workspaceMembers)
            .set({ removedAt: null, role: invite.role, designation: invite.designation ?? existing.designation, updatedAt: new Date() })
            .where(eq(workspaceMembers.id, existing.id));
        }
      } else {
        const [created] = await tx
          .insert(workspaceMembers)
          .values({ workspaceId: workspace.id, userId: auth.user.id, role: invite.role, designation: invite.designation })
          .returning({ id: workspaceMembers.id });
        if (!created) throw new Error("Insert returned no row");
        id = created.id;
      }
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
      await tx.insert(activityLog).values({
        workspaceId: workspace.id,
        type: "member.joined",
        actorMemberId: id,
        actorName: auth.user.name,
        entityType: "member",
        entityId: id,
        summary: `${auth.user.name} joined the workspace`,
      });
      return id;
    });

    await setActiveWorkspace(db, auth.sessionId, workspace.id);

    // Tell whoever sent the invite.
    if (invite.invitedBy) {
      const [inviter] = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.id, invite.invitedBy)).limit(1);
      if (inviter) {
        c.var.defer(
          notify(db, {
            workspaceId: workspace.id,
            userId: inviter.userId,
            type: "member.joined",
            title: `${auth.user.name} joined ${workspace.name}`,
            body: `Accepted your invite as ${invite.role}.`,
            link: `/app/team/${memberId}`,
          }),
        );
      }
    }
    return c.json({ ok: true, workspaceId: workspace.id });
  });
