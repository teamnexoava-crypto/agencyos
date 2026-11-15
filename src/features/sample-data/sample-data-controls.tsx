import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/api";
import { errorMessage } from "@/lib/api";
import { useAddSampleData, useRemoveSampleData } from "./api";

const REMOVE_TEXT =
  "The sample clients, projects (with their milestones and tasks), invoices, contracts, leads and expenses are deleted for good. Everything you added yourself stays – except tasks or milestones you added inside a sample project.";

/** Asks before removing the sample data, then removes it. */
function useRemoveWithConfirm() {
  const remove = useRemoveSampleData();
  const [open, setOpen] = useState(false);
  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Remove all sample data?"
      description={REMOVE_TEXT}
      confirmLabel="Remove sample data"
      onConfirm={() =>
        remove.mutate(undefined, {
          onSuccess: () => toast.success("Sample data removed. Your workspace is all yours."),
          onError: (error) => toast.error(errorMessage(error, "Could not remove the sample data.")),
        })
      }
    />
  );
  return { open: () => setOpen(true), pending: remove.isPending, dialog };
}

/**
 * A slim strip above every page while the workspace holds sample data, so nobody mistakes it for
 * real work – with a one-click way to clear it. Owners and admins only.
 */
export function SampleDataBanner() {
  const { workspace, canManage } = useSession();
  const remove = useRemoveWithConfirm();
  if (!workspace.sampleDataAt || !canManage) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-violet-500/10 px-4 py-2 text-center text-[13px] text-foreground print:hidden">
      <Sparkles className="size-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
      <span>
        You're looking at <strong>sample data</strong> – anything marked “(sample)” or “SAMPLE-” is an example to explore.
      </span>
      <button type="button" disabled={remove.pending} onClick={remove.open} className="font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-50">
        Remove sample data
      </button>
      {remove.dialog}
    </div>
  );
}

/** The Settings card: add the sample data (again), or remove it. */
export function SampleDataCard() {
  const { workspace } = useSession();
  const add = useAddSampleData();
  const remove = useRemoveWithConfirm();
  const has = workspace.sampleDataAt !== null;
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-semibold tracking-tight">Sample data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {has
              ? "Your workspace has example clients, projects, invoices, a contract, leads and expenses to explore. They don't count towards your plan's limits."
              : "Add example clients, projects, invoices, a contract, leads and expenses to see what every screen does. They don't count towards your plan's limits, and you can remove them with one click."}
          </p>
        </div>
        {has ? (
          <Button variant="outline" className="shrink-0" disabled={remove.pending} onClick={remove.open}>
            <Trash2 /> Remove sample data
          </Button>
        ) : (
          <Button
            variant="outline"
            className="shrink-0"
            disabled={add.isPending}
            onClick={() =>
              add.mutate(undefined, {
                onSuccess: () => toast.success("Sample data added – have a look around."),
                onError: (error) => toast.error(errorMessage(error, "Could not add the sample data.")),
              })
            }
          >
            <Sparkles /> Add sample data
          </Button>
        )}
      </div>
      {remove.dialog}
    </section>
  );
}
