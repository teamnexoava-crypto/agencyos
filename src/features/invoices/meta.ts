import type { PaymentMethod } from "@shared/constants";
import type { InvoiceDisplayStatus } from "@shared/invoice";

export const INVOICE_STATUS_META: Record<InvoiceDisplayStatus, { label: string; badge: string; dot: string }> = {
  draft: { label: "Draft", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
  sent: { label: "Sent", badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  viewed: { label: "Viewed", badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  partially_paid: { label: "Partially paid", badge: "bg-amber-500/12 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  paid: { label: "Paid", badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  overdue: { label: "Overdue", badge: "bg-rose-500/12 text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  cancelled: { label: "Cancelled", badge: "bg-slate-500/10 text-slate-500 line-through dark:text-slate-400", dot: "bg-slate-400" },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

export const invoiceUrl = (token: string) => `${window.location.origin}/i/${token}`;
