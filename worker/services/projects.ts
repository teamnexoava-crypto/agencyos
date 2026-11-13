import { and, asc, count, eq, exists, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { ProjectSummary, StepDTO, TaskDTO } from "../../shared/types";
import { clients, projectMembers, projectSteps, projects, tasks } from "../db/schema";
import { ApiError, notFound } from "../lib/errors";
import type { Tenant } from "../lib/tenant";

export type ProjectRow = typeof projects.$inferSelect;
export type StepRow = typeof projectSteps.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;

/**
 * Which projects the caller may see: owners and admins see every project in the workspace, members
 * only the projects they are assigned to. Combine with `t.where(projects, …)`.
 */
export function projectVisibility(t: Tenant): SQL | undefined {
  if (t.canSeeFinance) return undefined;
  return exists(
    t.db
      .select({ one: sql`1` })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projects.id), eq(projectMembers.memberId, t.member.id))),
  );
}

/** Loads one project the caller is allowed to see, or throws 404 (never 403 – don't reveal existence). */
export async function requireProject(t: Tenant, projectId: string): Promise<ProjectRow> {
  const [row] = await t.db
    .select()
    .from(projects)
    .where(t.where(projects, eq(projects.id, projectId), isNull(projects.deletedAt), projectVisibility(t)))
    .limit(1);
  if (!row) throw notFound("Project");
  return row;
}

/** Ensures a client id supplied by the browser belongs to this workspace. */
export async function requireClientId(t: Tenant, clientId: string): Promise<void> {
  const [row] = await t.db
    .select({ id: clients.id })
    .from(clients)
    .where(t.where(clients, eq(clients.id, clientId), isNull(clients.deletedAt)))
    .limit(1);
  if (!row) throw new ApiError(400, "invalid_client", "That client doesn't exist in this workspace.");
}

/** Builds list/detail summaries (client name, progress, counts, assignees) for a set of project rows. */
export async function summarizeProjects(t: Tenant, rows: ProjectRow[]): Promise<ProjectSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const clientIds = [...new Set(rows.map((row) => row.clientId).filter((id): id is string => id !== null))];

  const [clientRows, stepStats, taskStats, memberRows] = await Promise.all([
    clientIds.length
      ? t.db.select({ id: clients.id, name: clients.name }).from(clients).where(t.where(clients, inArray(clients.id, clientIds)))
      : Promise.resolve([]),
    t.db
      .select({
        projectId: projectSteps.projectId,
        total: count(),
        done: sql<number>`count(*) filter (where ${projectSteps.status} = 'completed')`.mapWith(Number),
      })
      .from(projectSteps)
      .where(t.where(projectSteps, inArray(projectSteps.projectId, ids)))
      .groupBy(projectSteps.projectId),
    t.db
      .select({
        projectId: tasks.projectId,
        total: count(),
        done: sql<number>`count(*) filter (where ${tasks.done})`.mapWith(Number),
      })
      .from(tasks)
      .where(t.where(tasks, inArray(tasks.projectId, ids)))
      .groupBy(tasks.projectId),
    t.db
      .select({ projectId: projectMembers.projectId, memberId: projectMembers.memberId })
      .from(projectMembers)
      .where(t.where(projectMembers, inArray(projectMembers.projectId, ids))),
  ]);

  const clientNames = new Map(clientRows.map((row) => [row.id, row.name]));
  const steps = new Map(stepStats.map((row) => [row.projectId, row]));
  const taskCounts = new Map(taskStats.map((row) => [row.projectId, row]));
  const members = new Map<string, string[]>();
  for (const row of memberRows) {
    const list = members.get(row.projectId) ?? [];
    list.push(row.memberId);
    members.set(row.projectId, list);
  }

  return rows.map((row) => {
    const stepCount = steps.get(row.id)?.total ?? 0;
    const stepsDone = steps.get(row.id)?.done ?? 0;
    return {
      id: row.id,
      title: row.title,
      clientId: row.clientId,
      clientName: row.clientId ? (clientNames.get(row.clientId) ?? null) : null,
      status: row.status,
      priority: row.priority,
      startDate: row.startDate,
      dueDate: row.dueDate,
      // Money is for owners and admins only.
      budget: t.canSeeFinance ? row.budget : null,
      tags: row.tags,
      position: row.position,
      progress: stepCount === 0 ? 0 : Math.round((stepsDone / stepCount) * 100),
      stepCount,
      stepsDone,
      taskCount: taskCounts.get(row.id)?.total ?? 0,
      tasksDone: taskCounts.get(row.id)?.done ?? 0,
      memberIds: members.get(row.id) ?? [],
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  });
}

export async function listProjectSummaries(t: Tenant, ...conditions: (SQL | undefined)[]): Promise<ProjectSummary[]> {
  const rows = await t.db
    .select()
    .from(projects)
    .where(t.where(projects, isNull(projects.deletedAt), projectVisibility(t), ...conditions))
    .orderBy(asc(projects.position), asc(projects.createdAt))
    .limit(1000);
  return summarizeProjects(t, rows);
}

export function toStepDTO(t: Tenant, row: StepRow): StepDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    status: row.status,
    assigneeId: row.assigneeId,
    amount: t.canSeeFinance ? row.amount : null,
    position: row.position,
    completedAt: row.completedAt?.getTime() ?? null,
  };
}

export function toTaskDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    title: row.title,
    assigneeId: row.assigneeId,
    dueDate: row.dueDate,
    done: row.done,
    doneAt: row.doneAt?.getTime() ?? null,
    position: row.position,
    createdAt: row.createdAt.getTime(),
  };
}

/** Replaces a project's assignees with exactly `memberIds` (already validated against the workspace). */
export async function setProjectMembers(t: Tenant, projectId: string, memberIds: string[]): Promise<void> {
  const unique = [...new Set(memberIds)];
  await t.db.transaction(async (tx) => {
    await tx.delete(projectMembers).where(and(eq(projectMembers.workspaceId, t.workspaceId), eq(projectMembers.projectId, projectId)));
    if (unique.length > 0) {
      await tx.insert(projectMembers).values(unique.map((memberId) => ({ workspaceId: t.workspaceId, projectId, memberId })));
    }
  });
}
