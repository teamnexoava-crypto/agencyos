import { invoiceDisplayStatus } from "@shared/invoice";
import type { InvoiceStatus } from "@shared/constants";
import { todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INVOICE_STATUS_META } from "./meta";

interface InvoiceStatusBadgeProps {
  invoice: { status: InvoiceStatus; dueDate: string; total: number; amountPaid: number };
  className?: string;
}

/** Status pill that shows the derived "Overdue" state when a sent invoice is past its due date. */
export function InvoiceStatusBadge({ invoice, className }: InvoiceStatusBadgeProps) {
  const meta = INVOICE_STATUS_META[invoiceDisplayStatus(invoice, todayIso())];
  return (
    <span className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", meta.badge, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
