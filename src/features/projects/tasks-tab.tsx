import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ListChecks, LoaderCircle, NotebookText, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { MemberSummary, ProjectDetail, TaskDTO } from "@shared/types";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useSession } from "@/features/auth/api";
import { useMembers } from "@/features/members/api";
import { MemberAvatar } from "@/features/members/member-avatar";
import { MemberSelect } from "@/features/members/member-select";
import { errorMessage } from "@/lib/api";
import { dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCreateTask, useDeleteTaskWithUndo, useUpdateTask } from "./api";
import { DUE_TONE_CLASS } from "./meta";
import { TaskEditDialog } from "./task-edit-dialog";

type Filter = "all" | "open" | "done";

function AddTaskForm({ projectId, members }: { projectId: string; members: MemberSummary[] }) {
  const createTask = useCreateTask(projectId);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate(
      { title: trimmed, assigneeId, dueDate },
      {
        // Keep assignee and date so several tasks for the same person can be added in a row.
        onSuccess: () => setTitle(""),
        onError: (error) => toast.error(errorMessage(error, "Could not add the task.")),
      },
    );
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mb-5 grid gap-2 rounded-2xl border bg-card p-3 shadow-soft sm:grid-cols-[minmax(0,1fr)_11rem_10rem_auto]"
    >
      <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a task…" aria-label="New task" maxLength={200} className="shadow-none" />
      <MemberSelect members={members} value={assigneeId} onChange={setAssigneeId} aria-label="Assign to" className="shadow-none" />
      <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-label="Due date" className="shadow-none" />
      <Button type="submit" disabled={title.trim() === "" || createTask.isPending}>
        {createTask.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />} Add
      </Button>
    </form>
  );
}

interface TasksTabProps {
  project: ProjectDetail;
  members: Map<string, MemberSummary>;
}

/** Checklist of to-dos for the project. Everyone on the project can add, assign and complete tasks. */
export function TasksTab({ project, members }: TasksTabProps) {
  const { canManage } = useSession();
  const { data: allMembers = [] } = useMembers();
  // Owners and admins may hand a task to anyone (that person joins the project team). A member can
  // only pick people already on the project – plus owners and admins, who see every project.
  const memberList = canManage ? allMembers : allMembers.filter((member) => member.role !== "member" || project.memberIds.includes(member.id));
  const updateTask = useUpdateTask(project.id);
  const deleteTask = useDeleteTaskWithUndo(project.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<TaskDTO | null>(null);

  // Open tasks first (in their own order), completed ones sink to the bottom.
  const sorted = [...project.tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position);
  const visible = sorted.filter((task) => filter === "all" || (filter === "done") === task.done);
  const open = project.taskCount - project.tasksDone;

  const toggle = (task: TaskDTO) =>
    updateTask.mutate({ taskId: task.id, input: { done: !task.done } }, { onError: (error) => toast.error(errorMessage(error, "Could not update the task.")) });

  return (
    <>
      <AddTaskForm projectId={project.id} members={memberList} />

      {project.tasks.length === 0 ? (
        <EmptyState icon={ListChecks} title="No tasks yet" description="Add the first to-do above and assign it to someone on the team." />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{open}</span> open · {project.tasksDone} done
            </p>
            <SegmentedControl
              label="Filter tasks"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "done", label: "Done" },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              {filter === "open" ? "Everything is done. Nice work!" : "No completed tasks yet."}
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              <AnimatePresence initial={false}>
                {visible.map((task) => {
                  const assignee = task.assigneeId ? members.get(task.assigneeId) : undefined;
                  const due = task.dueDate ? dueLabel(task.dueDate, task.done) : null;
                  return (
                    <motion.li
                      key={task.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="group border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Checkbox checked={task.done} onCheckedChange={() => toggle(task)} aria-label={`Mark "${task.title}" as ${task.done ? "not done" : "done"}`} />
                        {/* The whole text opens the task for editing. */}
                        <button type="button" onClick={() => setEditing(task)} className="min-w-0 flex-1 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          <p className={cn("text-sm leading-snug break-words transition-colors", task.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="mt-0.5 line-clamp-2 flex items-start gap-1 text-xs text-muted-foreground">
                              <NotebookText className="mt-px size-3 shrink-0" />
                              {task.description}
                            </p>
                          )}
                          {due && (
                            <p className={cn("mt-0.5 flex items-center gap-1 text-xs", DUE_TONE_CLASS[due.tone])}>
                              <CalendarDays className="size-3" />
                              {due.text}
                            </p>
                          )}
                        </button>
                        {assignee && <MemberAvatar member={assignee} />}
                        <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit task "${task.title}"`} onClick={() => setEditing(task)} className="text-muted-foreground hover:text-foreground">
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete task "${task.title}"`} onClick={() => deleteTask(task)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}

      <TaskEditDialog
        task={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        members={memberList}
        onSave={(input) => (editing ? updateTask.mutateAsync({ taskId: editing.id, input }) : Promise.resolve())}
        onDelete={deleteTask}
      />
    </>
  );
}
