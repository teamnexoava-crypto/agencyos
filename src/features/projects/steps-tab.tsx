import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, CircleDashed, GripVertical, ListOrdered, LoaderCircle, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { MemberSummary, ProjectDetail, StepDTO } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/features/auth/api";
import { MemberAvatar } from "@/features/members/member-avatar";
import { errorMessage } from "@/lib/api";
import { dueLabel, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDeleteStep, useReorderSteps, useUpdateStep } from "./api";
import { DUE_TONE_CLASS, STEP_STATUS_META } from "./meta";
import { StepFormDialog } from "./step-form-dialog";

interface StepRowProps {
  step: StepDTO;
  index: number;
  members: Map<string, MemberSummary>;
  canManage: boolean;
  currency: string;
  onToggle: (step: StepDTO) => void;
  onEdit: (step: StepDTO) => void;
  onDelete: (step: StepDTO) => void;
}

function StepRow({ step, index, members, canManage, currency, onToggle, onEdit, onDelete }: StepRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: !canManage });
  const done = step.status === "completed";
  const assignee = step.assigneeId ? members.get(step.assigneeId) : undefined;
  const due = step.dueDate ? dueLabel(step.dueDate, done) : null;
  const meta = STEP_STATUS_META[step.status];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-start gap-2 rounded-2xl border bg-card p-3.5 shadow-soft sm:gap-3 sm:p-4", isDragging && "relative z-10 shadow-lift")}
    >
      {canManage && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder step ${step.title}`}
          className="mt-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onToggle(step)}
            aria-label={`${step.title}: ${meta.label}. Mark as ${STEP_STATUS_META[meta.next].label.toLowerCase()}.`}
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150",
              step.status === "completed" && "border-success bg-success text-white",
              step.status === "in_progress" && "border-primary text-primary",
              step.status === "pending" && "border-input text-transparent hover:border-primary/60",
            )}
          >
            {step.status === "completed" ? <Check className="size-3.5" strokeWidth={3} /> : step.status === "in_progress" ? <CircleDashed className="size-3.5" /> : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {meta.label} — click for “{STEP_STATUS_META[meta.next].label}”
        </TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <p className={cn("leading-snug font-medium", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>
          <span className="tabular mr-1.5 text-muted-foreground">{index + 1}.</span>
          {step.title}
        </p>
        {step.description && <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{step.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className={cn("font-medium", step.status === "in_progress" ? "text-primary" : done ? "text-success" : "text-muted-foreground")}>{meta.label}</span>
          {due && (
            <span className={cn("flex items-center gap-1", DUE_TONE_CLASS[due.tone])}>
              <CalendarDays className="size-3.5" />
              {due.text}
            </span>
          )}
          {step.amount !== null && <span className="tabular font-medium text-foreground">{formatMoney(step.amount, currency)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {assignee && <MemberAvatar member={assignee} />}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${step.title}`} className="text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(step)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(step)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

interface StepsTabProps {
  project: ProjectDetail;
  members: Map<string, MemberSummary>;
}

/** Ordered milestones. Drag the handle to reorder; click the circle to advance a step's status. */
export function StepsTab({ project, members }: StepsTabProps) {
  const { canManage, workspace } = useSession();
  const updateStep = useUpdateStep(project.id);
  const deleteStep = useDeleteStep(project.id);
  const reorder = useReorderSteps(project.id);
  const [form, setForm] = useState<{ open: boolean; step?: StepDTO }>({ open: false });
  const [deleting, setDeleting] = useState<StepDTO | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = project.steps.map((step) => step.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorder.mutate(arrayMove(ids, from, to), { onError: (error) => toast.error(errorMessage(error, "Could not reorder the milestones.")) });
  };

  const addButton = canManage && (
    <Button onClick={() => setForm({ open: true })}>
      <Plus /> Add milestone
    </Button>
  );

  if (project.steps.length === 0) {
    return (
      <>
        <EmptyState
          icon={ListOrdered}
          title="No milestones yet"
          description={canManage ? "Break the project into milestones. Progress is calculated from the milestones you complete." : "The project owner hasn't added any milestones yet."}
          action={addButton}
        />
        <StepFormDialog open={form.open} onOpenChange={(open) => setForm((state) => ({ ...state, open }))} projectId={project.id} step={form.step} />
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 sm:max-w-md">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">
              {project.stepsDone} of {project.stepCount} milestones completed
            </span>
            <span className="tabular flex items-center gap-1.5 text-muted-foreground">
              {reorder.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              {project.progress}%
            </span>
          </div>
          <Progress value={project.progress} className="h-2" label="Milestones completed" />
        </div>
        {addButton}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={project.steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
          <ol className="grid gap-2.5">
            {project.steps.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                index={index}
                members={members}
                canManage={canManage}
                currency={workspace.currency}
                onToggle={(target) =>
                  updateStep.mutate(
                    { stepId: target.id, input: { status: STEP_STATUS_META[target.status].next } },
                    { onError: (error) => toast.error(errorMessage(error, "Could not update the milestone.")) },
                  )
                }
                onEdit={(target) => setForm({ open: true, step: target })}
                onDelete={setDeleting}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <StepFormDialog open={form.open} onOpenChange={(open) => setForm((state) => ({ ...state, open }))} projectId={project.id} step={form.step} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this milestone?"
        description={`"${deleting?.title ?? ""}" will be removed and the project's progress recalculated.`}
        onConfirm={() => {
          if (!deleting) return;
          deleteStep.mutate(deleting.id, {
            onSuccess: () => toast.success("Milestone deleted"),
            onError: (error) => toast.error(errorMessage(error, "Could not delete the milestone.")),
          });
          setDeleting(null);
        }}
      />
    </>
  );
}
