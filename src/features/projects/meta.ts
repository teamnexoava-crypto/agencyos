import type { ProjectPriority, ProjectStatus, StepStatus } from "@shared/constants";
import type { DueTone } from "@/lib/format";

/** Display metadata for project statuses – order here is the kanban column order. */
export const STATUS_META: Record<ProjectStatus, { label: string; dot: string; badge: string }> = {
  lead: { label: "Lead", dot: "bg-slate-400", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  in_progress: { label: "In Progress", dot: "bg-indigo-500", badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" },
  on_hold: { label: "On Hold", dot: "bg-amber-500", badge: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  completed: { label: "Completed", dot: "bg-emerald-500", badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", dot: "bg-rose-500", badge: "bg-rose-500/10 text-rose-600 dark:text-rose-300" },
};

export const PRIORITY_META: Record<ProjectPriority, { label: string; badge: string; rank: number }> = {
  low: { label: "Low", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300", rank: 0 },
  medium: { label: "Medium", badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300", rank: 1 },
  high: { label: "High", badge: "bg-orange-500/12 text-orange-700 dark:text-orange-300", rank: 2 },
  urgent: { label: "Urgent", badge: "bg-rose-500/12 text-rose-700 dark:text-rose-300", rank: 3 },
};

export const STEP_STATUS_META: Record<StepStatus, { label: string; next: StepStatus }> = {
  pending: { label: "Not started", next: "in_progress" },
  in_progress: { label: "In progress", next: "completed" },
  completed: { label: "Completed", next: "pending" },
};

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-destructive",
  soon: "text-warning",
  normal: "text-muted-foreground",
  done: "text-muted-foreground",
};
