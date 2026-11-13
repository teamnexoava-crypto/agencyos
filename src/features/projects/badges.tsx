import type { ProjectPriority, ProjectStatus } from "@shared/constants";
import { cn } from "@/lib/utils";
import { PRIORITY_META, STATUS_META } from "./meta";

const pill = "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn(pill, meta.badge, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: ProjectPriority; className?: string }) {
  const meta = PRIORITY_META[priority];
  return <span className={cn(pill, meta.badge, className)}>{meta.label}</span>;
}
