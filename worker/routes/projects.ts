import { Hono } from "hono";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { idSchema, reorderSchema } from "../../shared/schemas/common";
import {
  moveProjectSchema,
  projectMembersSchema,
  projectSchema,
  projectUpdateSchema,
  stepSchema,
  stepUpdateSchema,
  taskSchema,
  taskUpdateSchema,
} from "../../shared/schemas/project";
import type { ProjectDetail } from "../../shared/types";
import { projectSteps, projects, tasks } from "../db/schema";
import { notFound } from "../lib/errors";
import { tenant, type Tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { logActivity, notify } from "../services/activity";
import { requireMembers } from "../services/members";
import {
  listProjectSummaries,
  requireClientId,
  requireProject,
  setProjectMembers,
  summarizeProjects,
  toStepDTO,
  toTaskDTO,
  type ProjectRow,
} from "../services/projects";
import { projectFinance } from "../services/reports";
import type { AppEnv } from "../types";

const projectParam = z.object({ projectId: idSchema });
const stepParam = z.object({ projectId: idSchema, stepId: idSchema });
const taskParam = z.object({ projectId: idSchema, taskId: idSchema });

const emptyToNull = (value: string): string | null => (value === "" ? null : value);

const STATUS_LABELS: Record<ProjectRow["status"], string> = {
  lead: "Lead",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

async function loadDetail(t: Tenant, project: ProjectRow): Promise<ProjectDetail> {
  const [summaries, finance, stepRows, taskRows] = await Promise.all([
    summarizeProjects(t, [project]),
    // Money is computed (and sent) only for owners and admins.
    t.canSeeFinance ? projectFinance(t, project.id) : Promise.resolve(null),
    t.db
      .select()
      .from(projectSteps)
      .where(t.where(projectSteps, eq(projectSteps.projectId, project.id)))
      .orderBy(asc(projectSteps.position), asc(projectSteps.createdAt)),
    t.db
      .select()
      .from(tasks)
      .where(t.where(tasks, eq(tasks.projectId, project.id)))
      .orderBy(asc(tasks.done), asc(tasks.position), asc(tasks.createdAt)),
  ]);
  const summary = summaries[0];
  if (!summary) throw notFound("Project");
  return {
    ...summary,
    description: project.description,
    steps: stepRows.map((row) => toStepDTO(t, row)),
    tasks: taskRows.map(toTaskDTO),
    finance,
  };
}

/** Records status changes in the activity feed (with a dedicated event for completion). */
function logStatusChange(t: Tenant, project: ProjectRow, status: ProjectRow["status"]) {
  return logActivity(t, {
    type: status === "completed" ? "project.completed" : "project.status_changed",
    summary:
      status === "completed"
        ? `${t.user.name} completed project "${project.title}"`
        : `${t.user.name} moved "${project.title}" to ${STATUS_LABELS[status]}`,
    entityType: "project",
    entityId: project.id,
    projectId: project.id,
  });
}

/**
 * Projects, with their steps (milestones) and tasks.
 *
 * Who can do what:
 *  - owner / admin: everything.
 *  - member: sees only projects they are assigned to (`requireProject` 404s otherwise); may update
 *    step status and create / edit / complete tasks there; never sees budgets or milestone amounts.
 */
export const projectRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  /* ---------------------------------------------------------------- projects */

  .get("/", async (c) => {
    const t = tenant(c);
    return c.json({ projects: await listProjectSummaries(t) });
  })

  .post("/", validate("json", projectSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const input = c.req.valid("json");

    if (input.clientId) await requireClientId(t, input.clientId);
    await requireMembers(t.db, t.workspaceId, input.memberIds);

    // New cards go to the bottom of their kanban column.
    const [last] = await t.db
      .select({ position: max(projects.position) })
      .from(projects)
      .where(t.where(projects, eq(projects.status, input.status), isNull(projects.deletedAt)));

    const [project] = await t.db
      .insert(projects)
      .values({
        workspaceId: t.workspaceId,
        title: input.title,
        clientId: emptyToNull(input.clientId),
        description: emptyToNull(input.description),
        startDate: emptyToNull(input.startDate),
        dueDate: emptyToNull(input.dueDate),
        budget: input.budget,
        status: input.status,
        priority: input.priority,
        tags: input.tags,
        position: (last?.position ?? -1) + 1,
        createdBy: t.member.id,
      })
      .returning();
    if (!project) throw new Error("Insert returned no row");

    await setProjectMembers(t, project.id, input.memberIds);
    c.var.defer(
      logActivity(t, {
        type: "project.created",
        summary: `${t.user.name} created project "${project.title}"`,
        entityType: "project",
        entityId: project.id,
        projectId: project.id,
      }),
    );
    return c.json({ project: await loadDetail(t, project) }, 201);
  })

  .get("/:projectId", validate("param", projectParam), async (c) => {
    const t = tenant(c);
    const project = await requireProject(t, c.req.valid("param").projectId);
    return c.json({ project: await loadDetail(t, project) });
  })

  .patch("/:projectId", validate("param", projectParam), validate("json", projectUpdateSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const existing = await requireProject(t, c.req.valid("param").projectId);
    const input = c.req.valid("json");

    if (input.clientId) await requireClientId(t, input.clientId);
    if (input.memberIds) await requireMembers(t.db, t.workspaceId, input.memberIds);

    const [project] = await t.db
      .update(projects)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.clientId !== undefined && { clientId: emptyToNull(input.clientId) }),
        ...(input.description !== undefined && { description: emptyToNull(input.description) }),
        ...(input.startDate !== undefined && { startDate: emptyToNull(input.startDate) }),
        ...(input.dueDate !== undefined && { dueDate: emptyToNull(input.dueDate) }),
        ...(input.budget !== undefined && { budget: input.budget }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.tags !== undefined && { tags: input.tags }),
        updatedAt: new Date(),
      })
      .where(t.where(projects, eq(projects.id, existing.id)))
      .returning();
    if (!project) throw notFound("Project");

    if (input.memberIds) await setProjectMembers(t, project.id, input.memberIds);
    if (input.status !== undefined && input.status !== existing.status) {
      c.var.defer(logStatusChange(t, project, input.status));
    }
    return c.json({ project: await loadDetail(t, project) });
  })

  /** Kanban drop: set the card's status and rewrite the order of its destination column. */
  .post("/:projectId/move", validate("param", projectParam), validate("json", moveProjectSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const existing = await requireProject(t, c.req.valid("param").projectId);
    const { status, orderedIds } = c.req.valid("json");

    await t.db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(projects.workspaceId, t.workspaceId), eq(projects.id, existing.id)));
      // Positions are only ever written to rows of this workspace, whatever ids the browser sent.
      for (const [index, id] of orderedIds.entries()) {
        await tx
          .update(projects)
          .set({ position: index })
          .where(and(eq(projects.workspaceId, t.workspaceId), eq(projects.id, id), eq(projects.status, status)));
      }
    });

    if (status !== existing.status) c.var.defer(logStatusChange(t, existing, status));
    return c.json({ ok: true });
  })

  .put("/:projectId/members", validate("param", projectParam), validate("json", projectMembersSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    const { memberIds } = c.req.valid("json");
    await requireMembers(t.db, t.workspaceId, memberIds);
    await setProjectMembers(t, project.id, memberIds);
    return c.json({ project: await loadDetail(t, project) });
  })

  /** Soft delete – steps, tasks and files stay in the database but the project disappears everywhere. */
  .delete("/:projectId", validate("param", projectParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    await t.db
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(t.where(projects, eq(projects.id, project.id)));
    return c.json({ ok: true });
  })

  /* ---------------------------------------------------------------- steps / milestones */

  .post("/:projectId/steps", validate("param", projectParam), validate("json", stepSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    const input = c.req.valid("json");
    if (input.assigneeId) await requireMembers(t.db, t.workspaceId, [input.assigneeId]);

    const [last] = await t.db
      .select({ position: max(projectSteps.position) })
      .from(projectSteps)
      .where(t.where(projectSteps, eq(projectSteps.projectId, project.id)));

    const [step] = await t.db
      .insert(projectSteps)
      .values({
        workspaceId: t.workspaceId,
        projectId: project.id,
        title: input.title,
        description: emptyToNull(input.description),
        dueDate: emptyToNull(input.dueDate),
        status: input.status,
        assigneeId: emptyToNull(input.assigneeId),
        amount: input.amount,
        position: (last?.position ?? -1) + 1,
        completedAt: input.status === "completed" ? new Date() : null,
      })
      .returning();
    if (!step) throw new Error("Insert returned no row");
    return c.json({ step: toStepDTO(t, step) }, 201);
  })

  .put("/:projectId/steps/order", validate("param", projectParam), validate("json", reorderSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    const { orderedIds } = c.req.valid("json");

    await t.db.transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx
          .update(projectSteps)
          .set({ position: index })
          .where(and(eq(projectSteps.workspaceId, t.workspaceId), eq(projectSteps.projectId, project.id), eq(projectSteps.id, id)));
      }
    });
    return c.json({ ok: true });
  })

  .patch("/:projectId/steps/:stepId", validate("param", stepParam), validate("json", stepUpdateSchema), async (c) => {
    const t = tenant(c);
    const { projectId, stepId } = c.req.valid("param");
    const project = await requireProject(t, projectId);
    const input = c.req.valid("json");

    const [existing] = await t.db
      .select()
      .from(projectSteps)
      .where(t.where(projectSteps, eq(projectSteps.id, stepId), eq(projectSteps.projectId, project.id)))
      .limit(1);
    if (!existing) throw notFound("Step");

    // Members may move a step's status forward/back on their own projects; everything else is for managers.
    const onlyStatus = Object.keys(input).every((key) => key === "status");
    if (!onlyStatus) t.requireRole("owner", "admin");
    if (input.assigneeId) await requireMembers(t.db, t.workspaceId, [input.assigneeId]);

    const statusChanged = input.status !== undefined && input.status !== existing.status;
    const [step] = await t.db
      .update(projectSteps)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: emptyToNull(input.description) }),
        ...(input.dueDate !== undefined && { dueDate: emptyToNull(input.dueDate) }),
        ...(input.assigneeId !== undefined && { assigneeId: emptyToNull(input.assigneeId) }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(statusChanged && { status: input.status, completedAt: input.status === "completed" ? new Date() : null }),
        updatedAt: new Date(),
      })
      .where(t.where(projectSteps, eq(projectSteps.id, existing.id)))
      .returning();
    if (!step) throw notFound("Step");

    if (statusChanged && step.status === "completed") {
      c.var.defer(
        logActivity(t, {
          type: "step.completed",
          summary: `${t.user.name} completed "${step.title}" in ${project.title}`,
          entityType: "step",
          entityId: step.id,
          projectId: project.id,
        }),
      );
    }
    return c.json({ step: toStepDTO(t, step) });
  })

  .delete("/:projectId/steps/:stepId", validate("param", stepParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const { projectId, stepId } = c.req.valid("param");
    const project = await requireProject(t, projectId);
    const deleted = await t.db
      .delete(projectSteps)
      .where(t.where(projectSteps, eq(projectSteps.id, stepId), eq(projectSteps.projectId, project.id)))
      .returning({ id: projectSteps.id });
    if (deleted.length === 0) throw notFound("Step");
    return c.json({ ok: true });
  })

  /* ---------------------------------------------------------------- tasks */

  .post("/:projectId/tasks", validate("param", projectParam), validate("json", taskSchema), async (c) => {
    const t = tenant(c);
    const project = await requireProject(t, c.req.valid("param").projectId);
    const input = c.req.valid("json");
    const assignees = input.assigneeId ? await requireMembers(t.db, t.workspaceId, [input.assigneeId]) : [];

    const [last] = await t.db
      .select({ position: max(tasks.position) })
      .from(tasks)
      .where(t.where(tasks, eq(tasks.projectId, project.id)));

    const [task] = await t.db
      .insert(tasks)
      .values({
        workspaceId: t.workspaceId,
        projectId: project.id,
        title: input.title,
        assigneeId: emptyToNull(input.assigneeId),
        dueDate: emptyToNull(input.dueDate),
        position: (last?.position ?? -1) + 1,
        createdBy: t.member.id,
      })
      .returning();
    if (!task) throw new Error("Insert returned no row");

    const assignee = assignees[0];
    if (assignee && assignee.userId !== t.user.id) {
      c.var.defer(
        notify(t.db, {
          workspaceId: t.workspaceId,
          userId: assignee.userId,
          type: "task.assigned",
          title: `${t.user.name} assigned you a task`,
          body: `${task.title} · ${project.title}`,
          link: `/app/projects/${project.id}?tab=tasks`,
        }),
      );
    }
    return c.json({ task: toTaskDTO(task) }, 201);
  })

  .patch("/:projectId/tasks/:taskId", validate("param", taskParam), validate("json", taskUpdateSchema), async (c) => {
    const t = tenant(c);
    const { projectId, taskId } = c.req.valid("param");
    const project = await requireProject(t, projectId);
    const input = c.req.valid("json");

    const [existing] = await t.db
      .select()
      .from(tasks)
      .where(t.where(tasks, eq(tasks.id, taskId), eq(tasks.projectId, project.id)))
      .limit(1);
    if (!existing) throw notFound("Task");

    const assignees = input.assigneeId ? await requireMembers(t.db, t.workspaceId, [input.assigneeId]) : [];
    const doneChanged = input.done !== undefined && input.done !== existing.done;

    const [task] = await t.db
      .update(tasks)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.assigneeId !== undefined && { assigneeId: emptyToNull(input.assigneeId) }),
        ...(input.dueDate !== undefined && { dueDate: emptyToNull(input.dueDate) }),
        ...(doneChanged && { done: input.done, doneAt: input.done ? new Date() : null }),
        updatedAt: new Date(),
      })
      .where(t.where(tasks, eq(tasks.id, existing.id)))
      .returning();
    if (!task) throw notFound("Task");

    const assignee = assignees[0];
    if (assignee && assignee.id !== existing.assigneeId && assignee.userId !== t.user.id) {
      c.var.defer(
        notify(t.db, {
          workspaceId: t.workspaceId,
          userId: assignee.userId,
          type: "task.assigned",
          title: `${t.user.name} assigned you a task`,
          body: `${task.title} · ${project.title}`,
          link: `/app/projects/${project.id}?tab=tasks`,
        }),
      );
    }
    return c.json({ task: toTaskDTO(task) });
  })

  .delete("/:projectId/tasks/:taskId", validate("param", taskParam), async (c) => {
    const t = tenant(c);
    const { projectId, taskId } = c.req.valid("param");
    const project = await requireProject(t, projectId);
    const deleted = await t.db
      .delete(tasks)
      .where(t.where(tasks, eq(tasks.id, taskId), eq(tasks.projectId, project.id)))
      .returning({ id: tasks.id });
    if (deleted.length === 0) throw notFound("Task");
    return c.json({ ok: true });
  });
