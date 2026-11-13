import { CalendarDays, ListChecks } from "lucide-react";
import { Link } from "react-router";
import type { MemberSummary, ProjectSummary } from "@shared/types";
import { Progress } from "@/components/ui/progress";
import { AvatarStack } from "@/features/members/member-avatar";
import { dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DUE_TONE_CLASS } from "./meta";
import { PriorityBadge, StatusBadge } from "./badges";

interface ProjectCardProps {
  project: ProjectSummary;
  members: Map<string, MemberSummary>;
  /** Show the status pill (lists) or not (kanban, where the column already says it). */
  showStatus?: boolean;
  className?: string;
}

/** Card body shared by the kanban board, the mobile list and client pages. */
export function ProjectCardBody({ project, members, showStatus = false }: ProjectCardProps) {
  const closed = project.status === "completed" || project.status === "cancelled";
  const due = project.dueDate ? dueLabel(project.dueDate, closed) : null;
  const team = project.memberIds.map((id) => members.get(id)).filter((member): member is MemberSummary => member !== undefined);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 leading-snug font-medium">{project.title}</p>
          {project.clientName && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{project.clientName}</p>}
        </div>
        <PriorityBadge priority={project.priority} />
      </div>

      {(showStatus || project.tags.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {showStatus && <StatusBadge status={project.status} />}
          {project.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {tag}
            </span>
          ))}
          {project.tags.length > 3 && <span className="text-[11px] text-muted-foreground">+{project.tags.length - 3}</span>}
        </div>
      )}

      {project.stepCount > 0 && (
        <div className="mt-4 flex items-center gap-2.5">
          <Progress value={project.progress} label={`${project.title} progress`} />
          <span className="tabular shrink-0 text-xs font-medium text-muted-foreground">{project.progress}%</span>
        </div>
      )}

      <div className="mt-4 flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 text-xs">
          {due && (
            <span className={cn("flex items-center gap-1 truncate", DUE_TONE_CLASS[due.tone])}>
              <CalendarDays className="size-3.5 shrink-0" />
              {due.text}
            </span>
          )}
          {project.taskCount > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
              <ListChecks className="size-3.5" />
              <span className="tabular">
                {project.tasksDone}/{project.taskCount}
              </span>
            </span>
          )}
        </div>
        <AvatarStack members={team} />
      </div>
    </>
  );
}

/** Standalone, clickable project card (lists outside the kanban board). */
export function ProjectCard({ project, members, showStatus = true, className }: ProjectCardProps) {
  return (
    <Link
      to={`/app/projects/${project.id}`}
      className={cn(
        "block rounded-2xl border bg-card p-4 shadow-soft transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift",
        className,
      )}
    >
      <ProjectCardBody project={project} members={members} showStatus={showStatus} />
    </Link>
  );
}
