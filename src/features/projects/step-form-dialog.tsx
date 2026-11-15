import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { STEP_STATUSES } from "@shared/constants";
import { stepSchema, type StepInput } from "@shared/schemas/project";
import type { StepDTO } from "@shared/types";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/api";
import { useMembers } from "@/features/members/api";
import { MemberSelect } from "@/features/members/member-select";
import { errorMessage } from "@/lib/api";
import { useCreateStep, useUpdateStep } from "./api";
import { STEP_STATUS_META } from "./meta";

interface StepFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Present → edit mode. */
  step?: StepDTO;
}

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

function StepForm({ projectId, step, onOpenChange }: Omit<StepFormDialogProps, "open">) {
  const { workspace } = useSession();
  const { data: members = [] } = useMembers();
  const create = useCreateStep(projectId);
  const update = useUpdateStep(projectId);
  const saving = create.isPending || update.isPending;

  const form = useForm<StepInput>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      title: step?.title ?? "",
      description: step?.description ?? "",
      dueDate: step?.dueDate ?? "",
      status: step?.status ?? "pending",
      assigneeId: step?.assigneeId ?? "",
      amount: step?.amount ?? null,
    },
  });

  const onSubmit = form.handleSubmit((input) => {
    const options = {
      onSuccess: () => {
        toast.success(step ? "Milestone updated" : "Milestone added");
        onOpenChange(false);
      },
      onError: (error: unknown) => toast.error(errorMessage(error, "Could not save the milestone.")),
    };
    if (step) update.mutate({ stepId: step.id, input }, options);
    else create.mutate(input, options);
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Design mockups approved" autoComplete="off" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STEP_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STEP_STATUS_META[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due date {optional}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assignee {optional}</FormLabel>
                <MemberSelect members={members} value={field.value} onChange={field.onChange} aria-label="Assignee" />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount {optional}</FormLabel>
                <FormControl>
                  <MoneyInput currency={workspace.currency} value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" />
                </FormControl>
                <FormDescription>Becomes an invoice line item later.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description {optional}</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="What does done look like?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {step ? "Save changes" : "Add milestone"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function StepFormDialog({ open, onOpenChange, projectId, step }: StepFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{step ? "Edit milestone" : "New milestone"}</DialogTitle>
          <DialogDescription>Milestones are what your client sees on their portal. Completing them moves the project's progress.</DialogDescription>
        </DialogHeader>
        {open && <StepForm projectId={projectId} step={step} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
