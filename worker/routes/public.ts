import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { InvoiceDocument } from "../../shared/types";
import { activityLog, invoices, workspaces } from "../db/schema";
import { notFound } from "../lib/errors";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { buildInvoiceDocument, notifyManagers } from "../services/invoices";
import type { AppEnv } from "../types";

const tokenParam = z.object({ token: z.string().regex(/^[\w-]{21,64}$/) });

/**
 * Public, login-free pages reached through unguessable links (/i/:token now; contracts and the
 * client portal later). These routes are NOT tenant-scoped by a session – the token is the key – so
 * each one returns a hand-picked set of client-safe fields and all of them are rate-limited.
 */
export const publicRoutes = new Hono<AppEnv>()
  .use(rateLimit("PUBLIC_LIMITER"))

  .get("/invoices/:token", validate("param", tokenParam), async (c) => {
    const db = c.var.db;
    const [row] = await db
      .select({ invoice: invoices, workspace: workspaces })
      .from(invoices)
      .innerJoin(workspaces, eq(workspaces.id, invoices.workspaceId))
      .where(and(eq(invoices.publicToken, c.req.valid("param").token), isNull(invoices.deletedAt), isNull(workspaces.deletedAt)))
      .limit(1);
    // Drafts are not public yet: until the agency sends it, the link behaves as if it doesn't exist.
    if (!row || row.invoice.status === "draft") throw notFound("Invoice");
    let { invoice } = row;
    const { workspace } = row;

    // First open by someone outside the agency → mark as viewed and tell the owners/admins.
    const viewerIsTeam = c.var.auth?.workspace?.id === invoice.workspaceId;
    if (!viewerIsTeam && invoice.viewedAt === null && invoice.status !== "cancelled") {
      const [updated] = await db
        .update(invoices)
        .set({ viewedAt: new Date(), ...(invoice.status === "sent" && { status: "viewed" as const }) })
        .where(and(eq(invoices.id, invoice.id), isNull(invoices.viewedAt)))
        .returning();
      if (updated) {
        invoice = updated;
        c.executionCtx.waitUntil(
          Promise.all([
            db.insert(activityLog).values({
              workspaceId: invoice.workspaceId,
              type: "invoice.viewed",
              actorName: "Client",
              entityType: "invoice",
              entityId: invoice.id,
              projectId: invoice.projectId,
              summary: `Invoice ${invoice.number} was viewed by the client`,
              financeOnly: true,
            }),
            notifyManagers(db, invoice.workspaceId, {
              type: "invoice.viewed",
              title: `Invoice ${invoice.number} was viewed`,
              body: "Your client opened the invoice link.",
              link: `/app/invoices/${invoice.id}`,
            }),
          ]),
        );
      }
    }

    // `clientWhatsapp` is for the agency's share button only – never sent to the public page.
    const { clientWhatsapp: _omit, ...document } = await buildInvoiceDocument(db, invoice, workspace);
    const body: { invoice: InvoiceDocument } = { invoice: document };
    return c.json(body);
  });
