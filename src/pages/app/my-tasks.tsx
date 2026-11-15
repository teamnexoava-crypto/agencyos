import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, FolderKanban, ListChecks, NotebookText } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { MyTaskDTO } from "@shared/types";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { useMembers } from "@/features/members/api";
import { useDeleteTaskWithUndo, useMyTasks, useUpdateMyTask } from "@/features/projects/api";
import { DUE_TONE_CLASS } from "@/features/projects/meta";
import { TaskEditDialog } from "@/features/projects/task-edit-dialog";
import { errorMessage } from "@/lib/api";
import { daysUntil, dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "open" | "done";

const GROUPS = [
  { key: "overdue", title: "Overdue" },
  { key: "today", title: "Today" },
  { key: "week", title: "Next 7 days" },
  { key: "later", title: "Later" },
  { key: "none", title: "No due date" },
  { key: "done", title: "Done in the last 7 days" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

function groupOf(task: MyTaskDTO): GroupKey {
  if (task.done) return "done";
  if (!task.dueDate) return "none";
  const days = daysUntil(task.dueDate);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

/** One row: tick it off, open it to edit, or jump to its project. */
function MyTaskRow({ task, onToggle, onOpen }: { task: MyTaskDTO; onToggle: () => void; onOpen: () => void }) {
  const due = task.dueDate ? dueLabel(task.dueDate, task.done) : null;
  return (
    <motion.li layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="border-b last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <Checkbox className="mt-0.5" checked={task.done} onCheckedChange={onToggle} aria-label={`Mark "${task.title}" as ${task.done ? "not done" : "done"}`} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <p className={cn("text-sm leading-snug break-words", task.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{task.title}</p>
          {task.description && (
            <p className="mt-0.5 line-clamp-1 flex items-start gap-1 text-xs text-muted-foreground">
              <NotebookText className="mt-px size-3 shrink-0" /> {task.description}
            </p>
          )}
          {due && (
            <p className={cn("mt-0.5 flex items-center gap-1 text-xs", DUE_TONE_CLASS[due.tone])}>
              <CalendarDays className="size-3" /> {due.text}
            </p>
          )}
        </button>
        <Link
          to={`/app/projects/${task.project.id}?tab=tasks`}
          className="flex max-w-[45%] shrink-0 items-center gap-1.5 truncate rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <FolderKanban className="size-3 shrink-0" />
          <span className="truncate">{task.project.title}</span>
        </Link>
      </div>
    </motion.li>
  );
}

/** "My tasks": everything assigned to me, across all my projects, grouped by when it is due. */
export default function MyTasksPage() {
  const { data: tasks, isPending, error, refetch } = useMyTasks();
  const { data: members = [] } = useMembers();
  const { canManage } = useSession();
  const update = useUpdateMyTask();
  const [filter, setFilter] = useState<Filter>("open");
  const [editing, setEditing] = useState<MyTaskDTO | null>(null);
  const deleteInProject = useDeleteTaskWithUndo(editing?.project.id ?? "");

  const toggle = (task: MyTaskDTO) =>
    update.mutate({ projectId: task.project.id, taskId: task.id, input: { done: !task.done } }, { onError: (failure) => toast.error(errorMessage(failure, "Could not update the task.")) });

  const header = <PageHeader title="My tasks" description="Everything assigned to you, across all your projects." />;
  if (error) {
    return (
      <>
        {header}
        <ErrorState title="Couldn't load your tasks" description={errorMessage(error)} onRetry={() => void refetch()} />
      </>
    );
  }

  const list = tasks ?? [];
  const openCount = list.filter((task) => !task.done).length;
  const overdueCount = list.filter((task) => groupOf(task) === "overdue").length;
  const shown = list.filter((task) => (filter === "done") === task.done);

  return (
    <>
      {header}
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing assigned to you" description="When someone gives you a task in a project, it shows up here – with what's due first." />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{openCount}</span> open
              {overdueCount > 0 && (
                <>
                  {" "}
                  · <span className="font-medium text-destructive">{overdueCount} overdue</span>
                </>
              )}
            </p>
            <SegmentedControl
              label="Show"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "open", label: "To do" },
                { value: "done", label: "Done" },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{filter === "open" ? "All caught up. Nice work!" : "Nothing finished in the last 7 days."}</p>
          ) : (
            <div className="space-y-6">
              {GROUPS.map((group) => {
                const items = shown.filter((task) => groupOf(task) === group.key);
                if (items.length === 0) return null;
                return (
                  <section key={group.key} aria-label={group.title}>
                    <h2 className={cn("mb-2 text-xs font-semibold tracking-wide uppercase", group.key === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                      {group.title} <span className="font-normal">· {items.length}</span>
                    </h2>
                    <ul className="overflow-hidden rounded-2xl border bg-card shadow-soft">
                      <AnimatePresence initial={false}>
                        {items.map((task) => (
                          <MyTaskRow key={task.id} task={task} onToggle={() => toggle(task)} onOpen={() => setEditing(task)} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <TaskEditDialog
        task={editing}
        context={editing ? `In ${editing.project.title}` : undefined}
        onOpenChange={(open) => !open && setEditing(null)}
        // Owners and admins can hand it to anyone; a member only to owners/admins or themselves (the
        // server checks the project team either way).
        members={canManage ? members : members.filter((member) => member.role !== "member" || member.id === editing?.assigneeId)}
        onSave={(input) => (editing ? update.mutateAsync({ projectId: editing.project.id, taskId: editing.id, input }) : Promise.resolve())}
        onDelete={(task) => deleteInProject(task)}
      />
    </>
  );
}
