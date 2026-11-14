import { Hono } from "hono";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, notInArray, sql, sum, type SQL } from "drizzle-orm";
import { PROJECT_STATUSES, type ProjectStatus } from "../../shared/constants";
import { dateRangeSchema } from "../../shared/schemas/expense";
import type { ActivityItem, DashboardData, DeadlineItem, ProfitAndLoss } from "../../shared/types";
import { activityLog, clients, expenseCategories, expenses, invoices, payments, projectSteps, projects, tasks, workspaceMembers } from "../db/schema";
import { localToday } from "../lib/request";
import { tenant, type Tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { projectVisibility } from "../services/projects";
import { monthlySeries, outstandingBalance } from "../services/reports";
import { assertFeature } from "../services/billing";
import type { AppEnv } from "../types";

const plusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Work due in the next two weeks, plus anything already overdue – only from projects the caller can see. */
async function loadDeadlines(t: Tenant, projectIds: string[] | null, today: string): Promise<DeadlineItem[]> {
  const horizon = plusDays(today, 14);
  const inScope = (column: typeof projects.id | typeof projectSteps.projectId | typeof tasks.projectId): SQL | undefined =>
    projectIds === null ? undefined : projectIds.length === 0 ? sql`false` : inArray(column, projectIds);
  const openProject = and(isNull(projects.deletedAt), notInArray(projects.status, ["completed", "cancelled"]));

  const [projectRows, stepRows, taskRows] = await Promise.all([
    t.db
      .select({ id: projects.id, title: projects.title, dueDate: projects.dueDate })
      .from(projects)
      .where(t.where(projects, openProject, isNotNull(projects.dueDate), lte(projects.dueDate, horizon), inScope(projects.id)))
      .orderBy(asc(projects.dueDate))
      .limit(8),
    t.db
      .select({ id: projectSteps.id, title: projectSteps.title, dueDate: projectSteps.dueDate, projectId: projects.id, projectTitle: projects.title })
      .from(projectSteps)
      .innerJoin(projects, eq(projects.id, projectSteps.projectId))
      .where(t.where(projectSteps, openProject, ne(projectSteps.status, "completed"), isNotNull(projectSteps.dueDate), lte(projectSteps.dueDate, horizon), inScope(projectSteps.projectId)))
      .orderBy(asc(projectSteps.dueDate))
      .limit(8),
    t.db
      .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, projectId: projects.id, projectTitle: projects.title })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        t.where(
          tasks,
          openProject,
          eq(tasks.done, false),
          isNotNull(tasks.dueDate),
          lte(tasks.dueDate, horizon),
          inScope(tasks.projectId),
          // Members get their own tasks; managers see everyone's.
          t.canSeeFinance ? undefined : eq(tasks.assigneeId, t.member.id),
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(8),
  ]);

  const items: DeadlineItem[] = [
    ...projectRows.map((row) => ({ kind: "project" as const, id: row.id, title: row.title, projectId: row.id, projectTitle: row.title, dueDate: row.dueDate ?? "" })),
    ...stepRows.map((row) => ({ kind: "step" as const, id: row.id, title: row.title, projectId: row.projectId, projectTitle: row.projectTitle, dueDate: row.dueDate ?? "" })),
    ...taskRows.map((row) => ({ kind: "task" as const, id: row.id, title: row.title, projectId: row.projectId, projectTitle: row.projectTitle, dueDate: row.dueDate ?? "" })),
  ];
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8);
}

export const reportRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  /**
   * Home dashboard. Everyone gets project counts, deadlines and activity for the projects they can
   * see; the `finance` block is only computed and sent for owners and admins.
   */
  .get("/dashboard", validate("query", dateRangeSchema), async (c) => {
    const t = tenant(c);
    const range = c.req.valid("query");
    const today = localToday(c);

    const visible = await t.db
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(t.where(projects, isNull(projects.deletedAt), projectVisibility(t)));
    const projectStatus = Object.fromEntries(PROJECT_STATUSES.map((status) => [status, 0])) as Record<ProjectStatus, number>;
    for (const project of visible) projectStatus[project.status] += 1;
    // Managers see everything, so they need no id filter; members are limited to their own projects.
    const scopeIds = t.canSeeFinance ? null : visible.map((project) => project.id);

    const [team, myTasks, clientCount, deadlines, activityRows] = await Promise.all([
      t.db
        .select({ total: count() })
        .from(workspaceMembers)
        .where(t.where(workspaceMembers, isNull(workspaceMembers.removedAt))),
      t.db
        .select({ total: count() })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        // Only on projects the person can open (a member's own), and not on finished or cancelled ones.
        .where(t.where(tasks, eq(tasks.assigneeId, t.member.id), eq(tasks.done, false), isNull(projects.deletedAt), notInArray(projects.status, ["completed", "cancelled"]), projectVisibility(t))),
      t.db
        .select({ total: count() })
        .from(clients)
        .where(t.where(clients, isNull(clients.deletedAt))),
      loadDeadlines(t, scopeIds, today),
      t.db
        .select()
        .from(activityLog)
        .where(
          t.where(
            activityLog,
            // Members: nothing about money, and only events on projects they belong to.
            scopeIds === null ? undefined : and(eq(activityLog.financeOnly, false), scopeIds.length === 0 ? sql`false` : inArray(activityLog.projectId, scopeIds)),
          ),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(12),
    ]);

    let finance: DashboardData["finance"] = null;
    if (t.canSeeFinance) {
      const [monthly, outstanding, topClients, overdue] = await Promise.all([
        monthlySeries(t, range),
        outstandingBalance(t),
        t.db
          .select({ clientId: clients.id, name: clients.name, revenue: sum(payments.amount).mapWith(Number) })
          .from(payments)
          .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
          .innerJoin(clients, eq(clients.id, invoices.clientId))
          .where(t.where(payments, gte(payments.date, range.from), lte(payments.date, range.to)))
          .groupBy(clients.id, clients.name)
          .orderBy(desc(sum(payments.amount)))
          .limit(5),
        t.db
          .select({ id: invoices.id, number: invoices.number, clientName: clients.name, dueDate: invoices.dueDate, total: invoices.total, amountPaid: invoices.amountPaid })
          .from(invoices)
          .leftJoin(clients, eq(clients.id, invoices.clientId))
          .where(t.where(invoices, isNull(invoices.deletedAt), inArray(invoices.status, ["sent", "viewed", "partially_paid"]), lt(invoices.dueDate, today), gt(invoices.total, invoices.amountPaid)))
          .orderBy(asc(invoices.dueDate))
          .limit(6),
      ]);
      const revenue = monthly.reduce((total, point) => total + point.revenue, 0);
      const spent = monthly.reduce((total, point) => total + point.expenses, 0);
      finance = {
        revenue,
        expenses: spent,
        profit: revenue - spent,
        outstanding,
        monthly,
        topClients: topClients.map((row) => ({ clientId: row.clientId, name: row.name, revenue: row.revenue ?? 0 })),
        overdueInvoices: overdue.map((row) => ({ id: row.id, number: row.number, clientName: row.clientName, dueDate: row.dueDate, balance: row.total - row.amountPaid })),
      };
    }

    const body: DashboardData = {
      finance,
      activeProjects: projectStatus.in_progress,
      teamSize: team[0]?.total ?? 0,
      myOpenTasks: myTasks[0]?.total ?? 0,
      projectStatus,
      deadlines,
      activity: activityRows.map((row): ActivityItem => ({ id: row.id, type: row.type, summary: row.summary, projectId: row.projectId, createdAt: row.createdAt.getTime() })),
      isEmpty: visible.length === 0 && (clientCount[0]?.total ?? 0) === 0,
    };
    return c.json(body);
  })

  /** Profit & loss for a date range: by month, project, client and expense category. Owner/admin only. */
  .get("/pnl", validate("query", dateRangeSchema), async (c) => {
    const t = tenant(c);
    assertFeature(t, c.env, "finance");
    t.requireRole("owner", "admin");
    const range = c.req.valid("query");
    const paidInRange = t.where(payments, gte(payments.date, range.from), lte(payments.date, range.to));
    const spentInRange = t.where(expenses, isNull(expenses.deletedAt), gte(expenses.date, range.from), lte(expenses.date, range.to));

    const [byMonth, revenueByProject, expensesByProject, revenueByClient, expensesByClient, byCategory, projectRows, clientRows, teamCost] = await Promise.all([
      monthlySeries(t, range),
      t.db.select({ projectId: invoices.projectId, total: sum(payments.amount).mapWith(Number) }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(paidInRange).groupBy(invoices.projectId),
      t.db.select({ projectId: expenses.projectId, total: sum(expenses.amount).mapWith(Number) }).from(expenses).where(spentInRange).groupBy(expenses.projectId),
      t.db.select({ clientId: invoices.clientId, total: sum(payments.amount).mapWith(Number) }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(paidInRange).groupBy(invoices.clientId),
      // A project expense counts against that project's client; general expenses belong to no client.
      t.db.select({ clientId: projects.clientId, total: sum(expenses.amount).mapWith(Number) }).from(expenses).leftJoin(projects, eq(projects.id, expenses.projectId)).where(spentInRange).groupBy(projects.clientId),
      t.db
        .select({ categoryId: expenseCategories.id, name: expenseCategories.name, color: expenseCategories.color, total: sum(expenses.amount).mapWith(Number) })
        .from(expenses)
        .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
        .where(spentInRange)
        .groupBy(expenseCategories.id, expenseCategories.name, expenseCategories.color)
        .orderBy(desc(sum(expenses.amount))),
      t.db.select({ id: projects.id, title: projects.title, clientId: projects.clientId }).from(projects).where(t.where(projects)),
      t.db.select({ id: clients.id, name: clients.name }).from(clients).where(t.where(clients)),
      t.db
        .select({ total: sum(workspaceMembers.monthlyCost).mapWith(Number) })
        .from(workspaceMembers)
        .where(t.where(workspaceMembers, isNull(workspaceMembers.removedAt))),
    ]);

    const clientName = new Map(clientRows.map((row) => [row.id, row.name]));
    const projectById = new Map(projectRows.map((row) => [row.id, row]));

    const projectKeys = new Set<string | null>([...revenueByProject.map((row) => row.projectId), ...expensesByProject.map((row) => row.projectId)]);
    const revenueP = new Map(revenueByProject.map((row) => [row.projectId, row.total ?? 0]));
    const expenseP = new Map(expensesByProject.map((row) => [row.projectId, row.total ?? 0]));
    const byProject = [...projectKeys]
      .map((projectId) => {
        const project = projectId ? projectById.get(projectId) : undefined;
        const revenue = revenueP.get(projectId) ?? 0;
        const spent = expenseP.get(projectId) ?? 0;
        return {
          projectId,
          title: project?.title ?? (projectId ? "Deleted project" : "No project (general)"),
          clientName: project?.clientId ? (clientName.get(project.clientId) ?? null) : null,
          revenue,
          expenses: spent,
          profit: revenue - spent,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    const clientKeys = new Set<string | null>([...revenueByClient.map((row) => row.clientId), ...expensesByClient.map((row) => row.clientId)]);
    const revenueC = new Map(revenueByClient.map((row) => [row.clientId, row.total ?? 0]));
    const expenseC = new Map(expensesByClient.map((row) => [row.clientId, row.total ?? 0]));
    const byClient = [...clientKeys]
      .map((clientId) => {
        const revenue = revenueC.get(clientId) ?? 0;
        const spent = expenseC.get(clientId) ?? 0;
        return { clientId, name: clientId ? (clientName.get(clientId) ?? "Deleted client") : "No client (general)", revenue, expenses: spent, profit: revenue - spent };
      })
      .sort((a, b) => b.profit - a.profit);

    const revenue = byMonth.reduce((total, point) => total + point.revenue, 0);
    const spent = byMonth.reduce((total, point) => total + point.expenses, 0);
    const body: ProfitAndLoss = {
      totals: { revenue, expenses: spent, profit: revenue - spent },
      byMonth,
      byProject,
      byClient,
      byCategory: byCategory.map((row) => ({ categoryId: row.categoryId, name: row.name ?? "Uncategorised", color: row.color ?? "#94a3b8", amount: row.total ?? 0 })),
      teamMonthlyCost: teamCost[0]?.total ?? 0,
    };
    return c.json(body);
  });
