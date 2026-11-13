import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Link } from "react-router";
import type { MemberSummary, ProjectSummary } from "@shared/types";
import { Progress } from "@/components/ui/progress";
import { AvatarStack } from "@/features/members/member-avatar";
import { dueLabel } from "@/lib/format";
import { cn, staggerIndex } from "@/lib/utils";
import { DUE_TONE_CLASS, PRIORITY_META, STATUS_META } from "./meta";
import { PriorityBadge, StatusBadge } from "./badges";
import { ProjectCard } from "./project-card";

type SortKey = "title" | "client" | "status" | "priority" | "dueDate" | "progress";
interface Sort {
  key: SortKey;
  direction: "asc" | "desc";
}

const STATUS_ORDER = Object.keys(STATUS_META);

function compare(a: ProjectSummary, b: ProjectSummary, key: SortKey): number {
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title);
    case "client":
      return (a.clientName ?? "￿").localeCompare(b.clientName ?? "￿");
    case "status":
      return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    case "priority":
      return PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
    case "dueDate":
      // Projects without a due date always sort last.
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    case "progress":
      return a.progress - b.progress;
  }
}

interface ProjectsTableProps {
  projects: ProjectSummary[];
  members: Map<string, MemberSummary>;
}

/** Sortable table on desktop; the same data as stacked cards on phones. */
export function ProjectsTable({ projects, members }: ProjectsTableProps) {
  const [sort, setSort] = useState<Sort>({ key: "dueDate", direction: "asc" });
  const sorted = [...projects].sort((a, b) => compare(a, b, sort.key) * (sort.direction === "asc" ? 1 : -1));

  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={cn("px-4 py-3 text-left font-medium", className)}>
        <button
          type="button"
          onClick={() => setSort({ key, direction: active && sort.direction === "asc" ? "desc" : "asc" })}
          className={cn("-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:text-foreground", active && "text-foreground")}
        >
          {label}
          <Icon className={cn("size-3.5", !active && "opacity-50")} />
        </button>
      </th>
    );
  };

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-soft md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-[13px] text-muted-foreground">
            <tr>
              {header("title", "Project")}
              {header("client", "Client", "hidden lg:table-cell")}
              {header("status", "Status")}
              {header("priority", "Priority", "hidden xl:table-cell")}
              {header("dueDate", "Due")}
              {header("progress", "Progress", "w-44")}
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Team
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((project, index) => {
              const closed = project.status === "completed" || project.status === "cancelled";
              const due = project.dueDate ? dueLabel(project.dueDate, closed) : null;
              const team = project.memberIds.map((id) => members.get(id)).filter((member): member is MemberSummary => member !== undefined);
              return (
                <tr key={project.id} className="rise-in group relative transition-colors hover:bg-accent/40" style={staggerIndex(index)}>
                  <td className="max-w-xs px-4 py-3">
                    {/* The link stretches over the whole row, so the row is one big click target. */}
                    <Link to={`/app/projects/${project.id}`} className="font-medium after:absolute after:inset-0 hover:text-primary">
                      {project.title}
                    </Link>
                    {project.tags.length > 0 && <p className="mt-0.5 truncate text-xs text-muted-foreground">{project.tags.join(" · ")}</p>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{project.clientName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="hidden px-4 py-3 xl:table-cell">
                    <PriorityBadge priority={project.priority} />
                  </td>
                  <td className={cn("px-4 py-3 whitespace-nowrap", due ? DUE_TONE_CLASS[due.tone] : "text-muted-foreground")}>{due?.text ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Progress value={project.progress} label={`${project.title} progress`} />
                      <span className="tabular w-9 shrink-0 text-right text-xs text-muted-foreground">{project.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <AvatarStack members={team} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden">
        {sorted.map((project) => (
          <li key={project.id}>
            <ProjectCard project={project} members={members} />
          </li>
        ))}
      </ul>
    </>
  );
}
