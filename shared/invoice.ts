/**
 * Invoice arithmetic shared by the editor's live preview and the API. The server always recomputes
 * with these same functions and stores the result – totals sent by a browser are never trusted.
 * Everything is integer minor units (paise); rates are basis points (1800 = 18%).
 */
import type { DiscountType, InvoiceStatus, TaxMode } from "./constants";

export interface InvoiceLineInput {
  quantity: number;
  /** Minor units per unit. */
  rate: number;
}

export interface InvoiceTotals {
  /** Amount per line, in the order given. */
  lineAmounts: number[];
  subtotal: number;
  discountAmount: number;
  /** Subtotal after discount – the amount tax is charged on. */
  taxable: number;
  taxAmount: number;
  /** Tax split for display: [CGST, SGST] or [IGST] or []. Always sums to taxAmount. */
  taxLines: { label: string; rate: number; amount: number }[];
  total: number;
}

export const lineAmount = (line: InvoiceLineInput): number => Math.round(line.quantity * line.rate);

export function computeInvoiceTotals(input: {
  items: InvoiceLineInput[];
  discountType: DiscountType;
  /** Basis points when percent, minor units when fixed. */
  discountValue: number;
  taxMode: TaxMode;
  /** Total GST rate in basis points. */
  taxRate: number;
}): InvoiceTotals {
  const lineAmounts = input.items.map(lineAmount);
  const subtotal = lineAmounts.reduce((sum, amount) => sum + amount, 0);

  let discountAmount = 0;
  if (input.discountType === "percent") discountAmount = Math.round((subtotal * Math.min(input.discountValue, 10_000)) / 10_000);
  else if (input.discountType === "fixed") discountAmount = Math.min(input.discountValue, subtotal);

  const taxable = subtotal - discountAmount;
  const taxAmount = input.taxMode === "none" ? 0 : Math.round((taxable * input.taxRate) / 10_000);

  let taxLines: InvoiceTotals["taxLines"] = [];
  if (input.taxMode === "igst") {
    taxLines = [{ label: "IGST", rate: input.taxRate, amount: taxAmount }];
  } else if (input.taxMode === "cgst_sgst") {
    // Split evenly; any odd paisa goes to SGST so the two always add up exactly.
    const cgst = Math.floor(taxAmount / 2);
    taxLines = [
      { label: "CGST", rate: input.taxRate / 2, amount: cgst },
      { label: "SGST", rate: input.taxRate / 2, amount: taxAmount - cgst },
    ];
  }

  return { lineAmounts, subtotal, discountAmount, taxable, taxAmount, taxLines, total: taxable + taxAmount };
}

/** 1800 → "18%", 250 → "2.5%". */
export function formatRate(basisPoints: number): string {
  return `${Number((basisPoints / 100).toFixed(2))}%`;
}

export type InvoiceDisplayStatus = InvoiceStatus | "overdue";

/**
 * "Overdue" is never stored: an invoice is overdue when it has been sent, still has a balance and its
 * due date has passed. `today` is YYYY-MM-DD in the viewer's timezone.
 */
export function invoiceDisplayStatus(invoice: { status: InvoiceStatus; dueDate: string; total: number; amountPaid: number }, today: string): InvoiceDisplayStatus {
  const awaitingPayment = invoice.status === "sent" || invoice.status === "viewed" || invoice.status === "partially_paid";
  if (awaitingPayment && invoice.total - invoice.amountPaid > 0 && invoice.dueDate < today) return "overdue";
  return invoice.status;
}

/** UPI deep link understood by every UPI app (and encodable as a QR code). Amount in minor units. */
export function upiPaymentUrl(input: { upiId: string; payeeName: string; amount: number; note: string }): string {
  const params = new URLSearchParams({ pa: input.upiId, pn: input.payeeName, am: (input.amount / 100).toFixed(2), cu: "INR", tn: input.note });
  return `upi://pay?${params.toString()}`;
}

export const INVOICE_TEMPLATE_VARIABLES = ["client_name", "invoice_no", "project", "amount", "invoice_link", "agency_name", "due_date"] as const;

/** Fills {placeholders} in a WhatsApp / email message template. Unknown placeholders are left as typed. */
export function renderInvoiceMessage(template: string, values: Record<(typeof INVOICE_TEMPLATE_VARIABLES)[number], string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key as keyof typeof values] : match));
}
