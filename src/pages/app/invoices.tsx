import { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import { FileSearch, Plus, ReceiptText, Search } from "lucide-react";
import { Link } from "react-router";
import { invoiceDisplayStatus } from "@shared/invoice";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { CountUp } from "@/components/shared/count-up";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { useInvoices } from "@/features/invoices/api";
import { InvoiceRows } from "@/features/invoices/invoice-list";
import { formatMoney, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "draft" | "unpaid" | "overdue" | "paid";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];

export default function InvoicesPage() {
  const { workspace } = useSession();
  const { data, isPending, isError, refetch } = useInvoices();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const formatAmount = useCallback((value: number) => formatMoney(value, workspace.currency), [workspace.currency]);

  const today = todayIso();
  const invoices = useMemo(() => (data?.invoices ?? []).map((invoice) => ({ ...invoice, display: invoiceDisplayStatus(invoice, today) })), [data, today]);

  const summary = useMemo(() => {
    const open = invoices.filter((invoice) => ["sent", "viewed", "partially_paid", "overdue"].includes(invoice.display));
    const overdue = open.filter((invoice) => invoice.display === "overdue");
    const balance = (list: typeof invoices) => list.reduce((sum, invoice) => sum + invoice.total - invoice.amountPaid, 0);
    return { outstanding: balance(open), openCount: open.length, overdue: balance(overdue), overdueCount: overdue.length, drafts: invoices.filter((invoice) => invoice.display === "draft").length };
  }, [invoices]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "draft" && invoice.display === "draft") ||
        (filter === "paid" && invoice.display === "paid") ||
        (filter === "overdue" && invoice.display === "overdue") ||
        (filter === "unpaid" && ["sent", "viewed", "partially_paid", "overdue"].includes(invoice.display));
      return matchesFilter && (q === "" || `${invoice.number} ${invoice.clientName ?? ""} ${invoice.projectTitle ?? ""}`.toLowerCase().includes(q));
    });
  }, [invoices, filter, query]);

  const newButton = (
    <Button asChild>
      <Link to="/app/invoices/new">
        <Plus /> New invoice
      </Link>
    </Button>
  );

  const cards = [
    { label: "Outstanding", value: summary.outstanding, hint: `${summary.openCount} unpaid invoice${summary.openCount === 1 ? "" : "s"}` },
    { label: "Overdue", value: summary.overdue, hint: `${summary.overdueCount} past due`, tone: summary.overdue > 0 ? "text-destructive" : undefined },
    { label: "Collected this month", value: data?.collectedThisMonth ?? 0, hint: "Payments received", tone: "text-success" },
  ];

  return (
    <>
      <PageHeader title="Invoices" description="Bill clients and get paid faster." actions={newButton} />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <div role="status" aria-label="Loading invoices">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="mt-6 h-72 rounded-2xl" />
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No invoices yet"
          description="Create a GST-ready invoice, share it on WhatsApp and track when it's viewed and paid."
          action={newButton}
        />
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-3">
            {cards.map((card, index) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }}
                className="rounded-2xl border bg-card p-5 shadow-soft"
              >
                <dt className="text-sm text-muted-foreground">{card.label}</dt>
                <dd className={cn("tabular mt-1.5 text-2xl font-semibold tracking-tight", card.tone)}>
                  <CountUp value={card.value} format={formatAmount} />
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">{card.hint}</dd>
              </motion.div>
            ))}
          </dl>

          <div className="mt-6 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SegmentedControl
              label="Filter invoices"
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((option) => ({
                value: option.value,
                label: option.label,
                badge:
                  option.value === "draft" && summary.drafts > 0 ? (
                    <span className="tabular text-muted-foreground">{summary.drafts}</span>
                  ) : option.value === "overdue" && summary.overdueCount > 0 ? (
                    <span className="tabular text-destructive">{summary.overdueCount}</span>
                  ) : undefined,
              }))}
            />
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoices…" aria-label="Search invoices" className="h-9 pl-9" />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={FileSearch} title="No invoices match" description="Try another filter or search term." className="py-12" />
          ) : (
            <InvoiceRows invoices={visible} remind />
          )}
        </>
      )}
    </>
  );
}
