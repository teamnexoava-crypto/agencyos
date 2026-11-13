import { Hono } from "hono";
import { and, desc, eq, gte, isNull, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { computeInvoiceTotals } from "../../shared/invoice";
import { idSchema } from "../../shared/schemas/common";
import { invoiceSchema, paymentSchema, type InvoiceInput } from "../../shared/schemas/invoice";
import { formatInvoiceNumber } from "../../shared/schemas/workspace";
import type { InvoiceDefaults, InvoiceDetail, InvoiceListItem } from "../../shared/types";
import { clients, invoiceItems, invoices, payments, projects, workspaces } from "../db/schema";
import { ApiError, notFound } from "../lib/errors";
import { newPublicToken } from "../lib/ids";
import { tenant, type Tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { logActivity } from "../services/activity";
import { buildInvoiceDocument, invoiceMessageTemplate, notifyManagers, statusForPayments, toPaymentDTO, type InvoiceRow } from "../services/invoices";
import { requireClientId, requireProject } from "../services/projects";
import type { AppEnv } from "../types";

const idParam = z.object({ id: idSchema });
const paymentParam = z.object({ id: idSchema, paymentId: idSchema });
const listQuery = z.object({ clientId: idSchema.optional(), projectId: idSchema.optional() });
const emptyToNull = (value: string): string | null => (value === "" ? null : value);

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

async function requireInvoice(t: Tenant, id: string): Promise<InvoiceRow> {
  const [row] = await t.db
    .select()
    .from(invoices)
    .where(t.where(invoices, eq(invoices.id, id), isNull(invoices.deletedAt)))
    .limit(1);
  if (!row) throw notFound("Invoice");
  return row;
}

async function loadDetail(t: Tenant, invoice: InvoiceRow): Promise<InvoiceDetail> {
  const [document, paymentRows] = await Promise.all([
    buildInvoiceDocument(t.db, invoice, t.workspace),
    t.db
      .select()
      .from(payments)
      .where(t.where(payments, eq(payments.invoiceId, invoice.id)))
      .orderBy(desc(payments.date), desc(payments.createdAt)),
  ]);
  return {
    ...document,
    id: invoice.id,
    clientId: invoice.clientId,
    projectId: invoice.projectId,
    publicToken: invoice.publicToken,
    payments: paymentRows.map(toPaymentDTO),
    sentAt: invoice.sentAt?.getTime() ?? null,
    viewedAt: invoice.viewedAt?.getTime() ?? null,
    paidAt: invoice.paidAt?.getTime() ?? null,
    createdAt: invoice.createdAt.getTime(),
    messageTemplate: invoiceMessageTemplate(t.workspace),
  };
}

/** Checks the ids the browser sent, then turns the form into column values with server-computed totals. */
async function prepare(t: Tenant, input: InvoiceInput) {
  await requireClientId(t, input.clientId);
  if (input.projectId) await requireProject(t, input.projectId);
  const totals = computeInvoiceTotals(input);
  return {
    totals,
    values: {
      clientId: input.clientId,
      projectId: emptyToNull(input.projectId),
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      discountType: input.discountType,
      discountValue: input.discountType === "none" ? 0 : input.discountValue,
      taxMode: input.taxMode,
      taxRate: input.taxMode === "none" ? 0 : input.taxRate,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: emptyToNull(input.notes),
      terms: emptyToNull(input.terms),
      bankDetails: emptyToNull(input.bankDetails),
      upiId: emptyToNull(input.upiId),
    },
    items: input.items.map((item, index) => ({
      workspaceId: t.workspaceId,
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: totals.lineAmounts[index] ?? 0,
      position: index,
    })),
    defaults: input.saveDefaults
      ? {
          defaultTaxMode: input.taxMode,
          ...(input.taxMode !== "none" && { defaultTaxRate: input.taxRate }),
          invoiceNotes: emptyToNull(input.notes),
          invoiceTerms: emptyToNull(input.terms),
          bankDetails: emptyToNull(input.bankDetails),
          upiId: emptyToNull(input.upiId),
        }
      : null,
  };
}

/** Invoices and payments are financial data: the whole resource is owner/admin only. */
export const invoiceRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .use(async (c, next) => {
    tenant(c).requireRole("owner", "admin");
    await next();
  })

  .get("/", validate("query", listQuery), async (c) => {
    const t = tenant(c);
    const { clientId, projectId } = c.req.valid("query");
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;

    const [rows, collected] = await Promise.all([
      t.db
        .select({ invoice: invoices, clientName: clients.name, projectTitle: projects.title })
        .from(invoices)
        .leftJoin(clients, eq(clients.id, invoices.clientId))
        .leftJoin(projects, eq(projects.id, invoices.projectId))
        .where(
          t.where(invoices, isNull(invoices.deletedAt), clientId ? eq(invoices.clientId, clientId) : undefined, projectId ? eq(invoices.projectId, projectId) : undefined),
        )
        .orderBy(desc(invoices.sequence))
        .limit(2000),
      t.db
        .select({ total: sum(payments.amount).mapWith(Number) })
        .from(payments)
        .where(t.where(payments, gte(payments.date, monthStart))),
    ]);

    const list: InvoiceListItem[] = rows.map(({ invoice, clientName, projectTitle }) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      clientId: invoice.clientId,
      clientName,
      projectId: invoice.projectId,
      projectTitle,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
    }));
    return c.json({ invoices: list, collectedThisMonth: collected[0]?.total ?? 0 });
  })

  /** Prefill values for the "new invoice" form. */
  .get("/defaults", (c) => {
    const { workspace } = tenant(c);
    const defaults: InvoiceDefaults = {
      nextNumber: formatInvoiceNumber(workspace.invoicePrefix, workspace.invoiceNextNumber),
      dueDays: workspace.invoiceDueDays,
      taxMode: workspace.defaultTaxMode,
      taxRate: workspace.defaultTaxRate,
      notes: workspace.invoiceNotes,
      terms: workspace.invoiceTerms,
      bankDetails: workspace.bankDetails,
      upiId: workspace.upiId,
    };
    return c.json({ defaults });
  })

  .post("/", validate("json", invoiceSchema), async (c) => {
    const t = tenant(c);
    const prepared = await prepare(t, c.req.valid("json"));

    const invoice = await t.db.transaction(async (tx) => {
      // Taking the next number and bumping the counter in one UPDATE (which row-locks the workspace)
      // guarantees two invoices can never get the same number, even when created at the same moment.
      const [counter] = await tx
        .update(workspaces)
        .set({ invoiceNextNumber: sql`${workspaces.invoiceNextNumber} + 1`, ...prepared.defaults })
        .where(eq(workspaces.id, t.workspaceId))
        .returning({ next: workspaces.invoiceNextNumber, prefix: workspaces.invoicePrefix });
      if (!counter) throw new Error("Workspace not found");
      const sequence = counter.next - 1;

      const [created] = await tx
        .insert(invoices)
        .values({
          ...prepared.values,
          workspaceId: t.workspaceId,
          number: formatInvoiceNumber(counter.prefix, sequence),
          sequence,
          currency: t.workspace.currency,
          publicToken: newPublicToken(),
          createdBy: t.member.id,
        })
        .returning();
      if (!created) throw new Error("Insert returned no row");
      await tx.insert(invoiceItems).values(prepared.items.map((item) => ({ ...item, invoiceId: created.id })));
      return created;
    });

    c.var.defer(
      logActivity(t, {
        type: "invoice.created",
        summary: `${t.user.name} created invoice ${invoice.number} for ${money(invoice.total, invoice.currency)}`,
        entityType: "invoice",
        entityId: invoice.id,
        projectId: invoice.projectId,
        financeOnly: true,
      }),
    );
    return c.json({ invoice: await loadDetail(t, invoice) }, 201);
  })

  .get("/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    return c.json({ invoice: await loadDetail(t, await requireInvoice(t, c.req.valid("param").id)) });
  })

  /** Replaces the invoice's content. Locked once money has been received or it has been cancelled. */
  .put("/:id", validate("param", idParam), validate("json", invoiceSchema), async (c) => {
    const t = tenant(c);
    const existing = await requireInvoice(t, c.req.valid("param").id);
    if (existing.status === "cancelled") throw new ApiError(409, "invoice_locked", "A cancelled invoice can't be edited.");
    if (existing.amountPaid > 0) throw new ApiError(409, "invoice_locked", "This invoice has payments recorded, so it can't be edited. Remove the payments first.");

    const prepared = await prepare(t, c.req.valid("json"));
    const invoice = await t.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(invoices)
        .set({ ...prepared.values, updatedAt: new Date() })
        .where(and(eq(invoices.workspaceId, t.workspaceId), eq(invoices.id, existing.id)))
        .returning();
      if (!updated) throw new Error("Update returned no row");
      await tx.delete(invoiceItems).where(and(eq(invoiceItems.workspaceId, t.workspaceId), eq(invoiceItems.invoiceId, existing.id)));
      await tx.insert(invoiceItems).values(prepared.items.map((item) => ({ ...item, invoiceId: existing.id })));
      if (prepared.defaults) await tx.update(workspaces).set(prepared.defaults).where(eq(workspaces.id, t.workspaceId));
      return updated;
    });
    return c.json({ invoice: await loadDetail(t, invoice) });
  })

  /** Draft → Sent. Sharing the link from the app calls this first. */
  .post("/:id/send", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const existing = await requireInvoice(t, c.req.valid("param").id);
    if (existing.status !== "draft") return c.json({ invoice: await loadDetail(t, existing) });

    const [invoice] = await t.db
      .update(invoices)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(t.where(invoices, eq(invoices.id, existing.id)))
      .returning();
    if (!invoice) throw notFound("Invoice");
    c.var.defer(
      logActivity(t, { type: "invoice.sent", summary: `${t.user.name} sent invoice ${invoice.number}`, entityType: "invoice", entityId: invoice.id, projectId: invoice.projectId, financeOnly: true }),
    );
    return c.json({ invoice: await loadDetail(t, invoice) });
  })

  .post("/:id/cancel", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const existing = await requireInvoice(t, c.req.valid("param").id);
    if (existing.amountPaid > 0) throw new ApiError(409, "invoice_locked", "This invoice has payments recorded. Remove them before cancelling.");
    const [invoice] = await t.db
      .update(invoices)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(t.where(invoices, eq(invoices.id, existing.id)))
      .returning();
    if (!invoice) throw notFound("Invoice");
    return c.json({ invoice: await loadDetail(t, invoice) });
  })

  /** Issues a new public link; the old one stops working immediately. */
  .post("/:id/link", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const existing = await requireInvoice(t, c.req.valid("param").id);
    const [invoice] = await t.db
      .update(invoices)
      .set({ publicToken: newPublicToken(), updatedAt: new Date() })
      .where(t.where(invoices, eq(invoices.id, existing.id)))
      .returning();
    if (!invoice) throw notFound("Invoice");
    return c.json({ invoice: await loadDetail(t, invoice) });
  })

  /** Only drafts can be deleted – anything that was sent is cancelled instead, so numbers stay accounted for. */
  .delete("/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const existing = await requireInvoice(t, c.req.valid("param").id);
    if (existing.status !== "draft") throw new ApiError(409, "invoice_locked", "Only draft invoices can be deleted. Cancel this one instead.");
    await t.db
      .update(invoices)
      .set({ deletedAt: new Date() })
      .where(t.where(invoices, eq(invoices.id, existing.id)));
    return c.json({ ok: true });
  })

  /* ---------------------------------------------------------------- payments */

  .post("/:id/payments", validate("param", idParam), validate("json", paymentSchema), async (c) => {
    const t = tenant(c);
    const input = c.req.valid("json");
    const existing = await requireInvoice(t, c.req.valid("param").id);
    if (existing.status === "cancelled") throw new ApiError(409, "invoice_locked", "This invoice is cancelled.");

    const balance = existing.total - existing.amountPaid;
    if (input.amount > balance) {
      throw new ApiError(400, "validation_error", "Please check the highlighted fields.", { amount: `Only ${money(balance, existing.currency)} is still due on this invoice` });
    }

    const invoice = await t.db.transaction(async (tx) => {
      await tx.insert(payments).values({
        workspaceId: t.workspaceId,
        invoiceId: existing.id,
        amount: input.amount,
        date: input.date,
        method: input.method,
        reference: emptyToNull(input.reference),
        notes: emptyToNull(input.notes),
        createdBy: t.member.id,
      });
      // Re-add from the payments table rather than trusting the stored running total.
      const [paid] = await tx
        .select({ total: sum(payments.amount).mapWith(Number) })
        .from(payments)
        .where(and(eq(payments.workspaceId, t.workspaceId), eq(payments.invoiceId, existing.id)));
      const amountPaid = paid?.total ?? 0;
      const status = statusForPayments(existing, amountPaid);
      const [updated] = await tx
        .update(invoices)
        .set({
          amountPaid,
          status,
          sentAt: existing.sentAt ?? new Date(), // recording money against a draft means it was sent
          paidAt: status === "paid" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.workspaceId, t.workspaceId), eq(invoices.id, existing.id)))
        .returning();
      if (!updated) throw new Error("Update returned no row");
      return updated;
    });

    const fullyPaid = invoice.status === "paid";
    c.var.defer(
      Promise.all([
        logActivity(t, {
          type: fullyPaid ? "invoice.paid" : "invoice.payment_recorded",
          summary: fullyPaid
            ? `Invoice ${invoice.number} was paid in full (${money(invoice.total, invoice.currency)})`
            : `${money(input.amount, invoice.currency)} received for invoice ${invoice.number}`,
          entityType: "invoice",
          entityId: invoice.id,
          projectId: invoice.projectId,
          financeOnly: true,
        }),
        fullyPaid
          ? notifyManagers(
              t.db,
              t.workspaceId,
              { type: "invoice.paid", title: `Invoice ${invoice.number} is paid`, body: money(invoice.total, invoice.currency), link: `/app/invoices/${invoice.id}` },
              t.user.id,
            )
          : Promise.resolve(),
      ]),
    );
    return c.json({ invoice: await loadDetail(t, invoice) }, 201);
  })

  .delete("/:id/payments/:paymentId", validate("param", paymentParam), async (c) => {
    const t = tenant(c);
    const { id, paymentId } = c.req.valid("param");
    const existing = await requireInvoice(t, id);

    const invoice = await t.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(payments)
        .where(and(eq(payments.workspaceId, t.workspaceId), eq(payments.invoiceId, existing.id), eq(payments.id, paymentId)))
        .returning({ id: payments.id });
      if (deleted.length === 0) throw notFound("Payment");
      const [paid] = await tx
        .select({ total: sum(payments.amount).mapWith(Number) })
        .from(payments)
        .where(and(eq(payments.workspaceId, t.workspaceId), eq(payments.invoiceId, existing.id)));
      const amountPaid = paid?.total ?? 0;
      const status = existing.status === "cancelled" ? "cancelled" : statusForPayments(existing, amountPaid);
      const [updated] = await tx
        .update(invoices)
        .set({ amountPaid, status, paidAt: status === "paid" ? existing.paidAt : null, updatedAt: new Date() })
        .where(and(eq(invoices.workspaceId, t.workspaceId), eq(invoices.id, existing.id)))
        .returning();
      if (!updated) throw new Error("Update returned no row");
      return updated;
    });
    return c.json({ invoice: await loadDetail(t, invoice) });
  });
