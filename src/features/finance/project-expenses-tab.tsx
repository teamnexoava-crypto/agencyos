import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import type { ProjectDetail } from "@shared/types";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { formatMoney } from "@/lib/format";
import { useExpenses } from "./api";
import { ExpenseDialog } from "./expense-dialog";
import { ExpenseList } from "./expense-list";

/** Costs logged against one project. */
export function ProjectExpensesTab({ project }: { project: ProjectDetail }) {
  const { workspace } = useSession();
  const { data: expenses, isPending, isError, refetch } = useExpenses({ projectId: project.id });
  const [open, setOpen] = useState(false);

  const addButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus /> Add expense
    </Button>
  );
  const dialog = <ExpenseDialog open={open} onOpenChange={setOpen} projects={[]} lockedProjectId={project.id} />;

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-40 rounded-2xl" role="status" aria-label="Loading expenses" />;
  if (expenses.length === 0) {
    return (
      <>
        <EmptyState icon={Wallet} title="No expenses for this project" description="Log freelancer fees, tools and other costs to see what this project really earns." action={addButton} />
        {dialog}
      </>
    );
  }

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="text-sm">
          <p className="text-muted-foreground">Total spent</p>
          <p className="tabular mt-0.5 text-lg font-semibold">{formatMoney(total, workspace.currency)}</p>
        </div>
        {addButton}
      </div>
      <ExpenseList expenses={expenses} projects={[]} lockedProjectId={project.id} />
      {dialog}
    </>
  );
}
