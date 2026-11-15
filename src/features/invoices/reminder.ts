import type { InvoiceStatus } from "@shared/constants";
import type { InvoiceDetail } from "@shared/types";
import { daysUntil, formatDate, formatMoney } from "@/lib/format";
import { invoiceUrl } from "./meta";

/** A reminder only makes sense once the client has the invoice and there is still money to collect. */
export function canSendReminder(invoice: { status: InvoiceStatus; total: number; amountPaid: number }): boolean {
  const awaitingPayment = invoice.status === "sent" || invoice.status === "viewed" || invoice.status === "partially_paid";
  return awaitingPayment && invoice.total - invoice.amountPaid > 0;
}

/** Days past the due date (0 when not yet due). */
export const daysOverdue = (dueDate: string) => Math.max(0, -daysUntil(dueDate));

/** "was due on 13 Nov (overdue by 2 days)" / "is due today" / "is due on 20 Nov". */
function dueClause(dueDate: string): string {
  const late = daysOverdue(dueDate);
  if (late > 0) return `was due on ${formatDate(dueDate)} (overdue by ${late} day${late === 1 ? "" : "s"})`;
  if (daysUntil(dueDate) === 0) return "is due today";
  return `is due on ${formatDate(dueDate)}`;
}

/**
 * A short, polite payment reminder. Kept friendly on purpose – most late payments are simply
 * forgotten – and it always carries the link so the client can pay in one tap.
 */
export function reminderMessage(invoice: InvoiceDetail): string {
  const balance = formatMoney(invoice.total - invoice.amountPaid, invoice.currency);
  // After a part-payment, say "balance" so the client doesn't think we're asking for the full amount again.
  const amount = invoice.amountPaid > 0 ? `The remaining balance of ${balance}` : `The amount of ${balance}`;
  return [
    `Hi ${invoice.to.name}, a gentle reminder about invoice ${invoice.number} from ${invoice.from.name}. ${amount} ${dueClause(invoice.dueDate)}.`,
    `You can view and pay it here: ${invoiceUrl(invoice.publicToken)}`,
    "If you've already paid, please ignore this message. Thank you!",
  ].join("\n\n");
}

export const reminderSubject = (invoice: InvoiceDetail) => `Payment reminder: invoice ${invoice.number} from ${invoice.from.name}`;
