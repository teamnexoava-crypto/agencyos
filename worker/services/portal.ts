import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { CommentDTO, PortalData } from "../../shared/types";
import type { Database } from "../db";
import { clients, comments, contracts, files, invoices, projectSteps, projects, shareLinks, workspaces } from "../db/schema";
import { notFound } from "../lib/errors";
import { logoUrlFromKey } from "./workspaces";

export type CommentRow = typeof comments.$inferSelect;
export type ShareLinkRow = typeof shareLinks.$inferSelect;

export const toCommentDTO = (row: CommentRow): CommentDTO => ({ id: row.id, authorType: row.authorType, authorName: row.authorName, body: row.body, createdAt: row.createdAt.getTime() });

/** Resolves a /p/:token link. A link that is switched off, or whose project is gone, behaves as if it never existed. */
export async function findPortal(db: Database, token: string) {
  const [row] = await db
    .select({ link: shareLinks, project: projects, workspace: workspaces })
    .from(shareLinks)
    .innerJoin(projects, eq(projects.id, shareLinks.projectId))
    .innerJoin(workspaces, eq(workspaces.id, shareLinks.workspaceId))
    .where(and(eq(shareLinks.token, token), eq(shareLinks.enabled, true), isNull(projects.deletedAt), isNull(workspaces.deletedAt)))
    .limit(1);
  if (!row) throw notFound("Page");
  return row;
}

type Portal = Awaited<ReturnType<typeof findPortal>>;

/**
 * Builds the portal payload field by field. Nothing is spread from a database row, so a new internal
 * column can never leak here by accident: budgets, costs, expenses, profit, tasks, assignees, step
 * notes and amounts, client notes and internal ids are simply never read into the response.
 */
export async function buildPortalData(db: Database, { link, project, workspace }: Portal): Promise<PortalData> {
  // Every lookup is pinned to the link's own workspace and project.
  const scope = (table: { workspaceId: PgColumn; projectId: PgColumn }) => and(eq(table.workspaceId, link.workspaceId), eq(table.projectId, project.id));

  const [clientRows, stepRows, invoiceRows, contractRows, fileRows, commentRows] = await Promise.all([
    project.clientId
      ? db
          .select({ name: clients.name })
          .from(clients)
          .where(and(eq(clients.workspaceId, link.workspaceId), eq(clients.id, project.clientId)))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ title: projectSteps.title, status: projectSteps.status, dueDate: projectSteps.dueDate, completedAt: projectSteps.completedAt })
      .from(projectSteps)
      .where(scope(projectSteps))
      .orderBy(asc(projectSteps.position), asc(projectSteps.createdAt)),
    link.showInvoices
      ? db
          .select({
            number: invoices.number,
            status: invoices.status,
            issueDate: invoices.issueDate,
            dueDate: invoices.dueDate,
            total: invoices.total,
            amountPaid: invoices.amountPaid,
            currency: invoices.currency,
            token: invoices.publicToken,
          })
          .from(invoices)
          // Drafts and cancelled invoices are the agency's business only.
          .where(and(scope(invoices), isNull(invoices.deletedAt), inArray(invoices.status, ["sent", "viewed", "partially_paid", "paid"])))
          .orderBy(desc(invoices.issueDate))
      : Promise.resolve(null),
    link.showContract
      ? db
          .select({ title: contracts.title, status: contracts.status, token: contracts.publicToken })
          .from(contracts)
          .where(and(scope(contracts), isNull(contracts.deletedAt), inArray(contracts.status, ["sent", "viewed", "client_signed", "completed"])))
          .orderBy(desc(contracts.createdAt))
      : Promise.resolve(null),
    link.showFiles
      ? db
          .select({ id: files.id, name: files.name, contentType: files.contentType, size: files.size, createdAt: files.createdAt })
          .from(files)
          .where(and(scope(files), eq(files.kind, "project_file"), eq(files.sharedWithClient, true), isNull(files.deletedAt)))
          .orderBy(desc(files.createdAt))
      : Promise.resolve(null),
    link.allowComments
      ? db
          .select()
          .from(comments)
          .where(and(scope(comments), isNull(comments.deletedAt)))
          .orderBy(asc(comments.createdAt))
          .limit(500)
      : Promise.resolve(null),
  ]);

  const done = stepRows.filter((step) => step.status === "completed").length;
  return {
    agency: { name: workspace.name, logoUrl: logoUrlFromKey(workspace.logoKey), brandColor: workspace.brandColor, email: workspace.email, phone: workspace.phone },
    clientName: clientRows[0]?.name ?? null,
    project: {
      title: project.title,
      status: project.status,
      startDate: project.startDate,
      dueDate: project.dueDate,
      progress: stepRows.length === 0 ? (project.status === "completed" ? 100 : 0) : Math.round((done / stepRows.length) * 100),
    },
    steps: stepRows.map((step) => ({ title: step.title, status: step.status, dueDate: step.dueDate, completedAt: step.completedAt?.getTime() ?? null })),
    invoices: invoiceRows,
    contracts: contractRows,
    files: fileRows?.map((file) => ({ ...file, createdAt: file.createdAt.getTime() })) ?? null,
    comments: commentRows?.map(toCommentDTO) ?? null,
  };
}

/** Counts a visit by someone outside the agency. */
export async function recordPortalView(db: Database, link: ShareLinkRow): Promise<void> {
  try {
    await db
      .update(shareLinks)
      .set({ viewCount: sql`${shareLinks.viewCount} + 1`, lastViewedAt: new Date() })
      .where(eq(shareLinks.id, link.id));
  } catch (error) {
    console.error("Failed to record portal view", error);
  }
}
