import { Hono } from "hono";
import { desc, eq, ilike, isNull, or } from "drizzle-orm";
import { searchQuerySchema } from "../../shared/schemas/settings";
import type { SearchResult } from "../../shared/types";
import { clients, contracts, invoices, leads, projects } from "../db/schema";
import { tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { projectVisibility } from "../services/projects";
import type { AppEnv } from "../types";

const PER_TYPE = 5;

/**
 * Global search for the command palette. Members only ever get the projects and leads assigned to
 * them; clients, invoices and contracts are searched for owners and admins only.
 */
export const searchRoutes = new Hono<AppEnv>().use(requireAuth).get("/", validate("query", searchQuerySchema), async (c) => {
  const t = tenant(c);
  const { q } = c.req.valid("query");
  if (q.length < 2) return c.json({ results: [] as SearchResult[] });
  // The user's text is matched literally: % and _ are not wildcards.
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;

  const [projectRows, clientRows, invoiceRows, contractRows, leadRows] = await Promise.all([
    t.db
      .select({ id: projects.id, title: projects.title, clientName: clients.name })
      .from(projects)
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(t.where(projects, isNull(projects.deletedAt), projectVisibility(t), ilike(projects.title, pattern)))
      .orderBy(desc(projects.updatedAt))
      .limit(PER_TYPE),
    t.canSeeFinance
      ? t.db
          .select({ id: clients.id, name: clients.name, company: clients.company })
          .from(clients)
          .where(t.where(clients, isNull(clients.deletedAt), or(ilike(clients.name, pattern), ilike(clients.company, pattern), ilike(clients.email, pattern))))
          .orderBy(desc(clients.updatedAt))
          .limit(PER_TYPE)
      : Promise.resolve([]),
    t.canSeeFinance
      ? t.db
          .select({ id: invoices.id, number: invoices.number, clientName: clients.name })
          .from(invoices)
          .leftJoin(clients, eq(clients.id, invoices.clientId))
          .where(t.where(invoices, isNull(invoices.deletedAt), or(ilike(invoices.number, pattern), ilike(clients.name, pattern))))
          .orderBy(desc(invoices.issueDate))
          .limit(PER_TYPE)
      : Promise.resolve([]),
    t.canSeeFinance
      ? t.db
          .select({ id: contracts.id, title: contracts.title, clientName: clients.name })
          .from(contracts)
          .leftJoin(clients, eq(clients.id, contracts.clientId))
          .where(t.where(contracts, isNull(contracts.deletedAt), ilike(contracts.title, pattern)))
          .orderBy(desc(contracts.updatedAt))
          .limit(PER_TYPE)
      : Promise.resolve([]),
    // Leads: everyone searches, but a member only ever finds the ones assigned to them.
    t.db
      .select({ id: leads.id, name: leads.name, company: leads.company })
      .from(leads)
      .where(
        t.where(
          leads,
          isNull(leads.deletedAt),
          t.canSeeFinance ? undefined : eq(leads.assigneeId, t.member.id),
          or(ilike(leads.name, pattern), ilike(leads.company, pattern), ilike(leads.email, pattern), ilike(leads.phone, pattern)),
        ),
      )
      .orderBy(desc(leads.updatedAt))
      .limit(PER_TYPE),
  ]);

  const results: SearchResult[] = [
    ...projectRows.map((row): SearchResult => ({ type: "project", id: row.id, title: row.title, subtitle: t.canSeeFinance ? row.clientName : null, to: `/app/projects/${row.id}` })),
    ...clientRows.map((row): SearchResult => ({ type: "client", id: row.id, title: row.name, subtitle: row.company, to: `/app/clients/${row.id}` })),
    ...invoiceRows.map((row): SearchResult => ({ type: "invoice", id: row.id, title: row.number, subtitle: row.clientName, to: `/app/invoices/${row.id}` })),
    ...leadRows.map((row): SearchResult => ({ type: "lead", id: row.id, title: row.name, subtitle: row.company, to: `/app/crm?lead=${row.id}` })),
    ...contractRows.map((row): SearchResult => ({ type: "contract", id: row.id, title: row.title, subtitle: row.clientName, to: `/app/contracts/${row.id}` })),
  ];
  return c.json({ results });
});
