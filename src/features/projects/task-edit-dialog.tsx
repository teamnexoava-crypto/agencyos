import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { taskUpdateSchema, type TaskUpdateInput } from "@shared/schemas/project";
import type { MemberSummary, TaskDTO } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MemberSelect } from "@/features/members/member-select";
import { errorMessage } from "@/lib/api";

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

interface TaskEditDialogProps {
  task: TaskDTO | null;
  onOpenChange: (open: boolean) => void;
  /** People the task can be given to. */
  members: MemberSummary[];
  /** Saves the changes; resolves when they are stored. */
  onSave: (input: TaskUpdateInput) => Promise<unknown>;
  onDelete?: (task: TaskDTO) => void;
  /** Shown under the title, e.g. the project's name on "My tasks". */
  context?: string;
}

function TaskForm({ task, members, onSave, onDelete, onOpenChange }: Omit<TaskEditDialogProps, "task" | "context"> & { task: TaskDTO }) {
  const form = useForm<TaskUpdateInput>({
    resolver: zodResolver(taskUpdateSchema),
    defaultValues: { title: task.title, description: task.description ?? "", assigneeId: task.assigneeId ?? "", dueDate: task.dueDate ?? "", done: task.done },
  });
  const saving = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await onSave(input);
      toast.success("Task updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Could not save the task."));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task</FormLabel>
              <FormControl>
                <Input autoComplete="off" maxLength={200} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assigned to {optional}</FormLabel>
                <MemberSelect members={members} value={field.value ?? ""} onChange={field.onChange} aria-label="Assigned to" />
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
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
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
              <FormLabel>Notes {optional}</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder="Details, links, or what “done” looks like" maxLength={2000} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="done"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2.5">
              <FormControl>
                <Checkbox checked={field.value ?? false} onCheckedChange={(checked) => field.onChange(checked === true)} />
              </FormControl>
              <FormLabel className="!mt-0 font-normal">Done</FormLabel>
            </FormItem>
          )}
        />
        <DialogFooter className="gap-2 sm:justify-between">
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onOpenChange(false);
                onDelete(task);
              }}
            >
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <LoaderCircle className="animate-spin" />} Save
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Edit a task: title, who it's for, due date, notes and done – or delete it (with undo). */
export function TaskEditDialog({ task, onOpenChange, members, onSave, onDelete, context }: TaskEditDialogProps) {
  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>{context ?? "Change the details, hand it to someone else, or move the date."}</DialogDescription>
        </DialogHeader>
        {task && <TaskForm key={task.id} task={task} members={members} onSave={onSave} onDelete={onDelete} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
