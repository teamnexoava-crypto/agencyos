import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { InvoiceListItem } from "@shared/types";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InvoiceStatusBadge } from "./status-badge";

interface InvoiceRowsProps {
  invoices: InvoiceListItem[];
  /** Hide columns that would just repeat the page's own subject. */
  hide?: ("client" | "project")[];
  className?: string;
}

/** Compact invoice list used on the invoices page and embedded in client / project pages. */
export function InvoiceRows({ invoices, hide = [], className }: InvoiceRowsProps) {
  return (
    <ul className={cn("divide-y overflow-hidden rounded-2xl border bg-card shadow-soft", className)}>
      {invoices.map((invoice) => {
        const balance = invoice.total - invoice.amountPaid;
        const subtitle = [!hide.includes("client") && invoice.clientName, !hide.includes("project") && invoice.projectTitle].filter(Boolean).join(" · ");
        return (
          <li key={invoice.id}>
            <Link to={`/app/invoices/${invoice.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/40">
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
          </li>
        );
      })}
    </ul>
  );
}
