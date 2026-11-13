import { Plus, ReceiptText } from "lucide-react";
import { Link } from "react-router";
import type { ProjectDetail } from "@shared/types";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { formatMoney } from "@/lib/format";
import { useInvoices } from "./api";
import { InvoiceRows } from "./invoice-list";

/** Invoices raised for one project, with a one-click "create from this project" button. */
export function ProjectInvoicesTab({ project }: { project: ProjectDetail }) {
  const { workspace } = useSession();
  const { data, isPending, isError, refetch } = useInvoices({ projectId: project.id });

  const createButton = (
    <Button asChild>
      <Link to={`/app/invoices/new?project=${project.id}`}>
        <Plus /> Create invoice
      </Link>
    </Button>
  );

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-40 rounded-2xl" role="status" aria-label="Loading invoices" />;

  if (data.invoices.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="No invoices for this project"
        description="Create one in two clicks – the client and every milestone with an amount are filled in for you."
        action={createButton}
      />
    );
  }

  const billed = data.invoices.filter((invoice) => invoice.status !== "draft" && invoice.status !== "cancelled");
  const total = billed.reduce((sum, invoice) => sum + invoice.total, 0);
  const paid = billed.reduce((sum, invoice) => sum + invoice.amountPaid, 0);

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex gap-8 text-sm">
          <div>
            <dt className="text-muted-foreground">Billed</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold">{formatMoney(total, workspace.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Received</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold text-success">{formatMoney(paid, workspace.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Outstanding</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold">{formatMoney(total - paid, workspace.currency)}</dd>
          </div>
        </dl>
        {createButton}
      </div>
      <InvoiceRows invoices={data.invoices} hide={["project"]} />
    </>
  );
}
