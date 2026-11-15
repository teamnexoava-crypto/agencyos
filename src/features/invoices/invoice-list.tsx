import { ArrowUpRight, BellRing } from "lucide-react";
import { Link } from "react-router";
import { invoiceDisplayStatus } from "@shared/invoice";
import type { InvoiceListItem } from "@shared/types";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { cn, staggerIndex } from "@/lib/utils";
import { InvoiceStatusBadge } from "./status-badge";

interface InvoiceRowsProps {
  invoices: InvoiceListItem[];
  /** Hide columns that would just repeat the page's own subject. */
  hide?: ("client" | "project")[];
  /** Show a "Remind" shortcut on overdue rows (opens the invoice with its reminder ready). */
  remind?: boolean;
  className?: string;
}

/** Compact invoice list used on the invoices page and embedded in client / project pages. */
export function InvoiceRows({ invoices, hide = [], remind = false, className }: InvoiceRowsProps) {
  const today = todayIso();
  return (
    <ul className={cn("divide-y overflow-hidden rounded-2xl border bg-card shadow-soft", className)}>
      {invoices.map((invoice, index) => {
        const balance = invoice.total - invoice.amountPaid;
        const overdue = remind && invoiceDisplayStatus(invoice, today) === "overdue";
        const subtitle = [!hide.includes("client") && invoice.clientName, !hide.includes("project") && invoice.projectTitle].filter(Boolean).join(" · ");
        return (
          // The reminder shortcut sits beside the row link, not inside it – a link can't contain another link.
          <li key={invoice.id} className="rise-in flex items-center transition-colors hover:bg-accent/40" style={staggerIndex(index)}>
            <Link to={`/app/invoices/${invoice.id}`} className="group flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="tabular font-medium">{invoice.number}</span>
                  <InvoiceStatusBadge invoice={invoice} />
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {subtitle && `${subtitle} · `}Due {formatDate(invoice.dueDate)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular font-semibold">{formatMoney(invoice.total, invoice.currency)}</p>
                {invoice.amountPaid > 0 && balance > 0 && <p className="tabular text-xs text-muted-foreground">{formatMoney(balance, invoice.currency)} due</p>}
              </div>
              <ArrowUpRight className="hidden size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
            </Link>
            {overdue && (
              <Link
                to={`/app/invoices/${invoice.id}?remind=1`}
                aria-label={`Send a payment reminder for ${invoice.number}`}
                className="mr-3 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-500/15 dark:text-rose-300"
              >
                <BellRing className="size-3.5" />
                <span className="hidden sm:inline">Remind</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
