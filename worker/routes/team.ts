import { Hono } from "hono";
import { and, asc, count, eq, exists, gt, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_WA_INVITE_TEMPLATE, INVITE_TTL_MS } from "../../shared/constants";
import { idSchema } from "../../shared/schemas/common";
import { inviteSchema, memberUpdateSchema } from "../../shared/schemas/team";
import type { AssignedStep, AssignedTask, InviteDTO, MemberDetail, TeamMemberDTO, TeamResponse } from "../../shared/types";
import { invites, leads, projectMembers, projectSteps, projects, tasks, users, workspaceMembers } from "../db/schema";
import { ApiError, forbidden, notFound } from "../lib/errors";
import { newPublicToken } from "../lib/ids";
import { tenant, type Tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { logActivity } from "../services/activity";
import { listProjectSummaries, toStepDTO, toTaskDTO } from "../services/projects";
import type { AppEnv } from "../types";

const memberParam = z.object({ memberId: idSchema });
const inviteParam = z.object({ inviteId: idSchema });
const emptyToNull = (value: string): string | null => (value === "" ? null : value);

/** Members with their workload counters. Cost fields are blanked for viewers without finance access. */
async function loadMembers(t: Tenant, memberId?: string): Promise<TeamMemberDTO[]> {
  const rows = await t.db
    .select({ member: workspaceMembers, user: users })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(t.where(workspaceMembers, isNull(workspaceMembers.removedAt), memberId ? eq(workspaceMembers.id, memberId) : undefined))
    .orderBy(asc(workspaceMembers.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.member.id);
  const [projectCounts, taskCounts] = await Promise.all([
    t.db
      .select({ memberId: projectMembers.memberId, total: count() })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(t.where(projectMembers, inArray(projectMembers.memberId, ids), isNull(projects.deletedAt), ne(projects.status, "cancelled")))
      .groupBy(projectMembers.memberId),
    t.db
      .select({ memberId: tasks.assigneeId, total: count() })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(t.where(tasks, inArray(tasks.assigneeId, ids), eq(tasks.done, false), isNull(projects.deletedAt)))
      .groupBy(tasks.assigneeId),
  ]);
  const projectsBy = new Map(projectCounts.map((row) => [row.memberId, row.total]));
  const tasksBy = new Map(taskCounts.map((row) => [row.memberId, row.total]));

  return rows.map(({ member, user }) => ({
    id: member.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: member.role,
    designation: member.designation,
    phone: member.phone,
    monthlyCost: t.canSeeFinance ? member.monthlyCost : null,
    hourlyRate: t.canSeeFinance ? member.hourlyRate : null,
    projectCount: projectsBy.get(member.id) ?? 0,
    openTasks: tasksBy.get(member.id) ?? 0,
    joinedAt: member.createdAt.getTime(),
  }));
}

async function loadInvites(t: Tenant): Promise<InviteDTO[]> {
  const rows = await t.db
    .select({ invite: invites, inviterName: users.name })
    .from(invites)
    .leftJoin(workspaceMembers, eq(workspaceMembers.id, invites.invitedBy))
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(t.where(invites, isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
    .orderBy(asc(invites.createdAt));
  return rows.map(({ invite, inviterName }) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    designation: invite.designation,
    token: invite.token,
    invitedByName: inviterName,
    expiresAt: invite.expiresAt.getTime(),
    createdAt: invite.createdAt.getTime(),
  }));
}

/**
 * Team directory, invitations and member management.
 *
 * Rules
 *  - Everyone in the workspace can see the directory (names, roles, workload counts).
 *  - Owner and admin can invite, edit profiles and costs, and remove members.
 *  - Only the owner can change roles, and nobody can change or remove the owner.
 *  - Admins cannot edit or remove other admins.
 */
export const teamRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get("/", async (c) => {
    const t = tenant(c);
    const body: TeamResponse = {
      members: await loadMembers(t),
      invites: t.canSeeFinance ? await loadInvites(t) : [],
      inviteTemplate: t.workspace.waInviteTemplate ?? DEFAULT_WA_INVITE_TEMPLATE,
    };
    return c.json(body);
  })

  /** A member's profile and assigned work. Visible to owners/admins and to the member themself. */
  .get("/:memberId", validate("param", memberParam), async (c) => {
    const t = tenant(c);
    const { memberId } = c.req.valid("param");
    if (!t.canSeeFinance && memberId !== t.member.id) throw notFound("Member");

    const [member] = await loadMembers(t, memberId);
    if (!member) throw notFound("Member");

    // A member's work only counts on projects they are on (they can't open the others); owners and admins see every project.
    const onTheirProjects = (column: typeof tasks.projectId | typeof projectSteps.projectId): SQL | undefined =>
      member.role === "member"
        ? exists(
            t.db
              .select({ one: sql`1` })
              .from(projectMembers)
              .where(and(eq(projectMembers.projectId, column), eq(projectMembers.memberId, memberId))),
          )
        : undefined;
    const [projectIds, taskRows, stepRows] = await Promise.all([
      t.db.select({ id: projectMembers.projectId }).from(projectMembers).where(t.where(projectMembers, eq(projectMembers.memberId, memberId))),
      t.db
        .select({ task: tasks, projectTitle: projects.title })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(t.where(tasks, eq(tasks.assigneeId, memberId), eq(tasks.done, false), isNull(projects.deletedAt), onTheirProjects(tasks.projectId)))
        .orderBy(asc(tasks.dueDate), asc(tasks.createdAt))
        .limit(200),
      t.db
        .select({ step: projectSteps, projectTitle: projects.title })
        .from(projectSteps)
        .innerJoin(projects, eq(projects.id, projectSteps.projectId))
        .where(t.where(projectSteps, eq(projectSteps.assigneeId, memberId), ne(projectSteps.status, "completed"), isNull(projects.deletedAt), onTheirProjects(projectSteps.projectId)))
        .orderBy(asc(projectSteps.dueDate), asc(projectSteps.createdAt))
        .limit(200),
    ]);

    const ids = projectIds.map((row) => row.id);
    const detail: MemberDetail = {
      member,
      projects: ids.length ? await listProjectSummaries(t, inArray(projects.id, ids)) : [],
      tasks: taskRows.map(({ task, projectTitle }): AssignedTask => ({ ...toTaskDTO(task), projectId: task.projectId, projectTitle })),
      steps: stepRows.map(({ step, projectTitle }): AssignedStep => ({ ...toStepDTO(t, step), projectId: step.projectId, projectTitle })),
    };
    return c.json(detail);
  })

  .patch("/:memberId", validate("param", memberParam), validate("json", memberUpdateSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const { memberId } = c.req.valid("param");
    const input = c.req.valid("json");

    const [target] = await t.db
      .select()
      .from(workspaceMembers)
      .where(t.where(workspaceMembers, eq(workspaceMembers.id, memberId), isNull(workspaceMembers.removedAt)))
      .limit(1);
    if (!target) throw notFound("Member");

    const isSelf = target.id === t.member.id;
    if (t.role === "admin" && !isSelf && target.role !== "member") throw forbidden("Admins can only edit members.");
    if (input.role !== undefined && input.role !== target.role) {
      if (t.role !== "owner") throw forbidden("Only the owner can change roles.");
      if (target.role === "owner") throw forbidden("The owner's role can't be changed.");
    }

    await t.db
      .update(workspaceMembers)
      .set({
        ...(input.role !== undefined && target.role !== "owner" && { role: input.role }),
        ...(input.designation !== undefined && { designation: emptyToNull(input.designation) }),
        ...(input.phone !== undefined && { phone: emptyToNull(input.phone) }),
        ...(input.monthlyCost !== undefined && { monthlyCost: input.monthlyCost }),
        ...(input.hourlyRate !== undefined && { hourlyRate: input.hourlyRate }),
        updatedAt: new Date(),
      })
      .where(t.where(workspaceMembers, eq(workspaceMembers.id, target.id)));

    const [member] = await loadMembers(t, target.id);
    return c.json({ member });
  })

  /** Removes someone from the workspace. Their past work stays; they lose access immediately. */
  .delete("/:memberId", validate("param", memberParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const { memberId } = c.req.valid("param");

    const [target] = await t.db
      .select({ member: workspaceMembers, name: users.name })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(t.where(workspaceMembers, eq(workspaceMembers.id, memberId), isNull(workspaceMembers.removedAt)))
      .limit(1);
    if (!target) throw notFound("Member");
    if (target.member.role === "owner") throw forbidden("The workspace owner can't be removed.");
    if (target.member.id === t.member.id) throw forbidden("You can't remove yourself.");
    if (t.role === "admin" && target.member.role !== "member") throw forbidden("Admins can only remove members.");

    await t.db.transaction(async (tx) => {
      await tx
        .update(workspaceMembers)
        .set({ removedAt: new Date() })
        .where(and(eq(workspaceMembers.workspaceId, t.workspaceId), eq(workspaceMembers.id, target.member.id)));
      // Take them off project teams and hand back their open work and leads, so nothing stays assigned
      // to someone who is gone – and re-inviting them later starts from a clean slate.
      await tx.delete(projectMembers).where(and(eq(projectMembers.workspaceId, t.workspaceId), eq(projectMembers.memberId, target.member.id)));
      await tx
        .update(tasks)
        .set({ assigneeId: null })
        .where(and(eq(tasks.workspaceId, t.workspaceId), eq(tasks.assigneeId, target.member.id), eq(tasks.done, false)));
      await tx
        .update(projectSteps)
        .set({ assigneeId: null })
        .where(and(eq(projectSteps.workspaceId, t.workspaceId), eq(projectSteps.assigneeId, target.member.id), ne(projectSteps.status, "completed")));
      await tx
        .update(leads)
        .set({ assigneeId: null })
        .where(and(eq(leads.workspaceId, t.workspaceId), eq(leads.assigneeId, target.member.id)));
    });

    c.var.defer(
      logActivity(t, { type: "member.removed", summary: `${t.user.name} removed ${target.name} from the workspace`, entityType: "member", entityId: target.member.id }),
    );
    return c.json({ ok: true });
  })

  /* ---------------------------------------------------------------- invites */

  .post("/invites", validate("json", inviteSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const input = c.req.valid("json");
    if (input.role === "admin" && t.role !== "owner") throw forbidden("Only the owner can invite admins.");

    const [existing] = await t.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(t.where(workspaceMembers, eq(users.email, input.email), isNull(workspaceMembers.removedAt)))
      .limit(1);
    if (existing) throw new ApiError(409, "already_member", "That person is already in this workspace.", { email: "Already a member of this workspace" });

    // One live invite per address: sending again replaces the earlier link.
    await t.db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(t.where(invites, eq(invites.email, input.email), isNull(invites.acceptedAt), isNull(invites.revokedAt)));

    const [invite] = await t.db
      .insert(invites)
      .values({
        workspaceId: t.workspaceId,
        email: input.email,
        role: input.role,
        designation: emptyToNull(input.designation),
        token: newPublicToken(),
        invitedBy: t.member.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning();
    if (!invite) throw new Error("Insert returned no row");

    c.var.defer(
      logActivity(t, { type: "member.invited", summary: `${t.user.name} invited ${invite.email}`, entityType: "invite", entityId: invite.id }),
    );
    const dto: InviteDTO = {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      designation: invite.designation,
      token: invite.token,
      invitedByName: t.user.name,
      expiresAt: invite.expiresAt.getTime(),
      createdAt: invite.createdAt.getTime(),
    };
    return c.json({ invite: dto }, 201);
  })

  /** Revokes a pending invite – its link stops working immediately. */
  .delete("/invites/:inviteId", validate("param", inviteParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const updated = await t.db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(t.where(invites, eq(invites.id, c.req.valid("param").inviteId), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
      .returning({ id: invites.id });
    if (updated.length === 0) throw notFound("Invite");
    return c.json({ ok: true });
  });
