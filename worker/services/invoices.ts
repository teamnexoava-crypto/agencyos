import { and, asc, eq, inArray, isNull, ne, sum } from "drizzle-orm";
import { DEFAULT_WA_INVOICE_TEMPLATE, type InvoiceStatus, type NotificationType } from "../../shared/constants";
import type { InvoiceDocument, InvoiceItemDTO, PaymentDTO } from "../../shared/types";
import type { Database } from "../db";
import { clients, invoiceItems, invoices, notifications, type payments, projects, workspaceMembers } from "../db/schema";
import type { Tenant } from "../lib/tenant";
import type { WorkspaceRow } from "../types";
import { logoUrlFromKey } from "./workspaces";

export type InvoiceRow = typeof invoices.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

export function toPaymentDTO(row: PaymentRow): PaymentDTO {
  return { id: row.id, amount: row.amount, date: row.date, method: row.method, reference: row.reference, notes: row.notes, createdAt: row.createdAt.getTime() };
}

/**
 * Everything printed on an invoice. Built the same way for the app and for the public page, and
 * limited to fields that are meant to be seen by the client (no internal notes, no ids).
 */
export async function buildInvoiceDocument(db: Database, invoice: InvoiceRow, workspace: WorkspaceRow): Promise<InvoiceDocument & { clientWhatsapp: string | null }> {
  // Every lookup is pinned to the invoice's own workspace.
  const [itemRows, clientRows, projectRows] = await Promise.all([
    db
      .select()
      .from(invoiceItems)
      .where(and(eq(invoiceItems.workspaceId, invoice.workspaceId), eq(invoiceItems.invoiceId, invoice.id)))
      .orderBy(asc(invoiceItems.position)),
    invoice.clientId
      ? db
          .select()
          .from(clients)
          .where(and(eq(clients.workspaceId, invoice.workspaceId), eq(clients.id, invoice.clientId)))
          .limit(1)
      : Promise.resolve([]),
    invoice.projectId
      ? db
          .select({ title: projects.title })
          .from(projects)
          .where(and(eq(projects.workspaceId, invoice.workspaceId), eq(projects.id, invoice.projectId)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const client = clientRows[0];

  return {
    number: invoice.number,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    items: itemRows.map((item): InvoiceItemDTO => ({ id: item.id, description: item.description, quantity: item.quantity, rate: item.rate, amount: item.amount })),
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
    taxMode: invoice.taxMode,
    taxRate: invoice.taxRate,
    subtotal: invoice.subtotal,
    discountAmount: invoice.discountAmount,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    notes: invoice.notes,
    terms: invoice.terms,
    bankDetails: invoice.bankDetails,
    upiId: invoice.upiId,
    projectTitle: projectRows[0]?.title ?? null,
    from: {
      name: workspace.name,
      logoUrl: logoUrlFromKey(workspace.logoKey),
      address: workspace.address,
      gstNumber: workspace.gstNumber,
      phone: workspace.phone,
      email: workspace.email,
      brandColor: workspace.brandColor,
    },
    to: {
      name: client?.name ?? "Client",
      company: client?.company ?? null,
      address: client?.address ?? null,
      gstNumber: client?.gstNumber ?? null,
      email: client?.email ?? null,
    },
    clientWhatsapp: client?.whatsapp ?? null,
  };
}

/** Where an invoice's status lands for a given amount paid. */
export function statusForPayments(invoice: Pick<InvoiceRow, "total" | "viewedAt" | "sentAt">, amountPaid: number): InvoiceStatus {
  // A zero-total invoice has nothing to collect: it is settled as soon as it has been sent.
  if (amountPaid >= invoice.total && (amountPaid > 0 || invoice.sentAt !== null)) return "paid";
  if (amountPaid > 0) return "partially_paid";
  if (invoice.viewedAt) return "viewed";
  return invoice.sentAt ? "sent" : "draft";
}

export const invoiceMessageTemplate = (workspace: WorkspaceRow) => workspace.waInvoiceTemplate ?? DEFAULT_WA_INVOICE_TEMPLATE;

/** In-app notification for every owner and admin of a workspace (optionally skipping whoever caused it). */
export async function notifyManagers(
  db: Database,
  workspaceId: string,
  entry: { type: NotificationType; title: string; body?: string; link?: string },
  exceptUserId?: string,
): Promise<void> {
  try {
    const managers = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role, ["owner", "admin"]),
          isNull(workspaceMembers.removedAt),
          exceptUserId ? ne(workspaceMembers.userId, exceptUserId) : undefined,
        ),
      );
    if (managers.length === 0) return;
    await db.insert(notifications).values(
      managers.map((manager) => ({ workspaceId, userId: manager.userId, type: entry.type, title: entry.title, body: entry.body ?? null, link: entry.link ?? null })),
    );
  } catch (error) {
    console.error("Failed to notify managers", error);
  }
}

/** Billed / paid totals per client, for the client pages (cancelled and draft invoices don't count as billed). */
export async function clientBillingTotals(t: Tenant, clientIds: string[]): Promise<Map<string, { billed: number; paid: number }>> {
  if (clientIds.length === 0) return new Map();
  const rows = await t.db
    .select({ clientId: invoices.clientId, billed: sum(invoices.total).mapWith(Number), paid: sum(invoices.amountPaid).mapWith(Number) })
    .from(invoices)
    .where(t.where(invoices, inArray(invoices.clientId, clientIds), isNull(invoices.deletedAt), inArray(invoices.status, ["sent", "viewed", "partially_paid", "paid"])))
    .groupBy(invoices.clientId);
  return new Map(rows.filter((row) => row.clientId !== null).map((row) => [row.clientId as string, { billed: row.billed ?? 0, paid: row.paid ?? 0 }]));
}
