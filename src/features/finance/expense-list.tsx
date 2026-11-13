import { useState } from "react";
import { MoreHorizontal, Paperclip, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ExpenseDTO, ProjectSummary } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSession } from "@/features/auth/api";
import { errorMessage } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useDeleteExpense } from "./api";
import { ExpenseDialog } from "./expense-dialog";
import { staggerIndex } from "@/lib/utils";

interface ExpenseListProps {
  expenses: ExpenseDTO[];
  projects: ProjectSummary[];
  /** Hide the project column and lock new/edited expenses to this project. */
  lockedProjectId?: string;
}

/** Expense rows with edit / delete and a link to the receipt. Stacks into cards on phones. */
export function ExpenseList({ expenses, projects, lockedProjectId }: ExpenseListProps) {
  const { workspace } = useSession();
  const deleteExpense = useDeleteExpense();
  const [editing, setEditing] = useState<ExpenseDTO | null>(null);
  const [deleting, setDeleting] = useState<ExpenseDTO | null>(null);

  return (
    <>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
        {expenses.map((expense, index) => (
          <li key={expense.id} className="rise-in flex items-center gap-3 px-4 py-3" style={staggerIndex(index)}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{expense.description}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{formatDate(expense.date)}</span>
                {expense.categoryName && <span>· {expense.categoryName}</span>}
                {expense.vendor && <span>· {expense.vendor}</span>}
                {!lockedProjectId && expense.projectTitle && <span className="truncate">· {expense.projectTitle}</span>}
              </p>
            </div>
            {expense.receipt && (
              <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
                <a href={`/api/files/${expense.receipt.fileId}`} target="_blank" rel="noopener noreferrer" aria-label={`Open receipt for ${expense.description}`}>
                  <Paperclip />
                </a>
              </Button>
            )}
            <p className="tabular shrink-0 text-sm font-semibold">{formatMoney(expense.amount, workspace.currency)}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${expense.description}`} className="text-muted-foreground">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(expense)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(expense)}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      <ExpenseDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} expense={editing ?? undefined} projects={projects} lockedProjectId={lockedProjectId} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this expense?"
        description={`"${deleting?.description ?? ""}" and its receipt will be removed from your books.`}
        onConfirm={() => {
          if (!deleting) return;
          deleteExpense.mutate(deleting.id, { onSuccess: () => toast.success("Expense deleted"), onError: (error) => toast.error(errorMessage(error, "Could not delete the expense.")) });
          setDeleting(null);
        }}
      />
    </>
  );
}
