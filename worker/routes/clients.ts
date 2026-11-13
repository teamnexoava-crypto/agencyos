import { Hono } from "hono";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "../../shared/schemas/common";
import { clientSchema, clientUpdateSchema } from "../../shared/schemas/client";
import type { ClientDTO, ClientDetail } from "../../shared/types";
import { clients, projects } from "../db/schema";
import { notFound } from "../lib/errors";
import { tenant, type Tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { logActivity } from "../services/activity";
import { clientBillingTotals } from "../services/invoices";
import { listProjectSummaries } from "../services/projects";
import type { AppEnv } from "../types";

type ClientRow = typeof clients.$inferSelect;

const idParam = z.object({ id: idSchema });
const emptyToNull = (value: string): string | null => (value === "" ? null : value);

function toDTO(row: ClientRow, projectCount: number): ClientDTO {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    whatsapp: row.whatsapp,
    gstNumber: row.gstNumber,
    address: row.address,
    notes: row.notes,
    projectCount,
    createdAt: row.createdAt.getTime(),
  };
}

async function requireClient(t: Tenant, id: string): Promise<ClientRow> {
  const [row] = await t.db
    .select()
    .from(clients)
    .where(t.where(clients, eq(clients.id, id), isNull(clients.deletedAt)))
    .limit(1);
  if (!row) throw notFound("Client");
  return row;
}

/**
 * Clients hold billing details and internal notes, so the whole resource is owner/admin only.
 * (Members still see the client's name on projects they are assigned to.)
 */
export const clientRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .use(async (c, next) => {
    tenant(c).requireRole("owner", "admin");
    await next();
  })

  .get("/", async (c) => {
    const t = tenant(c);
    const [rows, counts] = await Promise.all([
      t.db
        .select()
        .from(clients)
        .where(t.where(clients, isNull(clients.deletedAt)))
        .orderBy(asc(clients.name))
        .limit(2000),
      t.db
        .select({ clientId: projects.clientId, total: count() })
        .from(projects)
        .where(t.where(projects, isNull(projects.deletedAt)))
        .groupBy(projects.clientId),
    ]);
    const projectCounts = new Map(counts.map((row) => [row.clientId, row.total]));
    return c.json({ clients: rows.map((row) => toDTO(row, projectCounts.get(row.id) ?? 0)) });
  })

  .post("/", validate("json", clientSchema), async (c) => {
    const t = tenant(c);
    const input = c.req.valid("json");
    const [row] = await t.db
      .insert(clients)
      .values({
        workspaceId: t.workspaceId,
        name: input.name,
        company: emptyToNull(input.company),
        email: emptyToNull(input.email),
        whatsapp: emptyToNull(input.whatsapp),
        gstNumber: emptyToNull(input.gstNumber),
        address: emptyToNull(input.address),
        notes: emptyToNull(input.notes),
      })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    c.executionCtx.waitUntil(
      logActivity(t, { type: "client.created", summary: `${t.user.name} added client ${row.name}`, entityType: "client", entityId: row.id }),
    );
    return c.json({ client: toDTO(row, 0) }, 201);
  })

  .get("/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const row = await requireClient(t, c.req.valid("param").id);
    const clientProjects = await listProjectSummaries(t, eq(projects.clientId, row.id));
    const detail: ClientDetail = {
      ...toDTO(row, clientProjects.length),
      projects: clientProjects,
      totals: (await clientBillingTotals(t, [row.id])).get(row.id) ?? { billed: 0, paid: 0 },
    };
    return c.json({ client: detail });
  })

  .patch("/:id", validate("param", idParam), validate("json", clientUpdateSchema), async (c) => {
    const t = tenant(c);
    const existing = await requireClient(t, c.req.valid("param").id);
    const input = c.req.valid("json");

    const [row] = await t.db
      .update(clients)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.company !== undefined && { company: emptyToNull(input.company) }),
        ...(input.email !== undefined && { email: emptyToNull(input.email) }),
        ...(input.whatsapp !== undefined && { whatsapp: emptyToNull(input.whatsapp) }),
        ...(input.gstNumber !== undefined && { gstNumber: emptyToNull(input.gstNumber) }),
        ...(input.address !== undefined && { address: emptyToNull(input.address) }),
        ...(input.notes !== undefined && { notes: emptyToNull(input.notes) }),
        updatedAt: new Date(),
      })
      .where(t.where(clients, eq(clients.id, existing.id)))
      .returning();
    if (!row) throw notFound("Client");

    const [projectCount] = await t.db
      .select({ total: count() })
      .from(projects)
      .where(t.where(projects, and(eq(projects.clientId, row.id), isNull(projects.deletedAt))));
    return c.json({ client: toDTO(row, projectCount?.total ?? 0) });
  })

  /** Soft delete. The client's projects are kept (they simply show no client). */
  .delete("/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const existing = await requireClient(t, c.req.valid("param").id);
    await t.db
      .update(clients)
      .set({ deletedAt: new Date() })
      .where(t.where(clients, eq(clients.id, existing.id)));
    return c.json({ ok: true });
  });
