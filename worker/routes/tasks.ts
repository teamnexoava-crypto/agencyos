import { Hono } from "hono";
import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { MyTaskDTO } from "../../shared/types";
import { projects, tasks } from "../db/schema";
import { tenant } from "../lib/tenant";
import { requireAuth } from "../middleware/context";
import { projectVisibility, toTaskDTO } from "../services/projects";
import type { AppEnv } from "../types";

/** Completed tasks stay on "My tasks" this long, so ticking one off doesn't make it vanish at once. */
const KEEP_DONE_MS = 7 * 86_400_000;

/**
 * "My tasks": everything assigned to the signed-in person, across every project they can see. Editing
 * and completing a task go through the project's own task routes.
 */
export const taskRoutes = new Hono<AppEnv>().use(requireAuth).get("/mine", async (c) => {
  const t = tenant(c);
  const rows = await t.db
    .select({ task: tasks, project: { id: projects.id, title: projects.title } })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        t.where(tasks, eq(tasks.assigneeId, t.member.id), or(eq(tasks.done, false), gt(tasks.doneAt, new Date(Date.now() - KEEP_DONE_MS)))),
        isNull(projects.deletedAt),
        projectVisibility(t),
      ),
    )
    .orderBy(asc(tasks.done), asc(tasks.dueDate), desc(tasks.createdAt))
    .limit(500);
  const body: { tasks: MyTaskDTO[] } = { tasks: rows.map((row) => ({ ...toTaskDTO(row.task), project: row.project })) };
  return c.json(body);
});
