import { useMemo, useState } from "react";
import { FolderKanban, FolderSearch, Kanban, Plus, Search, Table2 } from "lucide-react";
import { toast } from "sonner";
import { PROJECT_PRIORITIES, PROJECT_STATUSES, type ProjectStatus } from "@shared/constants";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { useMemberMap } from "@/features/members/api";
import { useMoveProject, useProjects } from "@/features/projects/api";
import { KanbanBoard } from "@/features/projects/kanban-board";
import { PRIORITY_META, STATUS_META } from "@/features/projects/meta";
import { ProjectFormDialog } from "@/features/projects/project-form-dialog";
import { ProjectsTable } from "@/features/projects/projects-table";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type View = "board" | "table";
const ALL = "all";

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden" role="status" aria-label="Loading projects">
      {Array.from({ length: 4 }, (_, column) => (
        <div key={column} className="w-72 shrink-0 space-y-2.5">
          <Skeleton className="mb-3 h-5 w-28" />
          {Array.from({ length: 3 - (column % 2) }, (_, card) => (
            <Skeleton key={card} className="h-32 rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const { canManage } = useSession();
  const { data: projects, isPending, isError, refetch } = useProjects();
  const members = useMemberMap();
  const moveProject = useMoveProject();

  const [view, setView] = useLocalStorage<View>("aos-projects-view", "board");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [priority, setPriority] = useState<string>(ALL);
  const [client, setClient] = useState<string>(ALL);
  const [dialog, setDialog] = useState<{ open: boolean; status?: ProjectStatus }>({ open: false });

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const project of projects ?? []) if (project.clientId && project.clientName) seen.set(project.clientId, project.clientName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? []).filter(
      (project) =>
        (status === ALL || view === "board" || project.status === status) &&
        (priority === ALL || project.priority === priority) &&
        (client === ALL || project.clientId === client) &&
        (q === "" || `${project.title} ${project.clientName ?? ""} ${project.tags.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [projects, query, status, priority, client, view]);

  const hasFilters = query !== "" || priority !== ALL || client !== ALL || (view === "table" && status !== ALL);
  const clearFilters = () => {
    setQuery("");
    setStatus(ALL);
    setPriority(ALL);
    setClient(ALL);
  };

  const newProjectButton = canManage && (
    <Button onClick={() => setDialog({ open: true })}>
      <Plus /> New project
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Projects"
        description={canManage ? "Plan, track and deliver client work." : "Projects you're assigned to."}
        actions={newProjectButton}
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <BoardSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={canManage ? "No projects yet" : "You're not on any projects yet"}
          description={
            canManage
              ? "Create your first project to start planning milestones, assigning tasks and tracking progress."
              : "When an owner or admin assigns you to a project, it will show up here."
          }
          action={newProjectButton}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…" aria-label="Search projects" className="pl-9" />
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2">
              {view === "table" && (
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 w-auto min-w-36" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {PROJECT_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {STATUS_META[value].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9 w-auto min-w-36" aria-label="Filter by priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All priorities</SelectItem>
                  {PROJECT_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {PRIORITY_META[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clientOptions.length > 0 && (
                <Select value={client} onValueChange={setClient}>
                  <SelectTrigger className="h-9 w-auto min-w-36" aria-label="Filter by client">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All clients</SelectItem>
                    {clientOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  Clear
                </Button>
              )}

              <div role="group" aria-label="View" className="ml-auto flex rounded-lg border bg-card p-0.5 shadow-soft">
                {(
                  [
                    { value: "board", label: "Board", icon: Kanban },
                    { value: "table", label: "Table", icon: Table2 },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setView(option.value)}
                    aria-pressed={view === option.value}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                      view === option.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <option.icon className="size-4" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={FolderSearch}
              title="No projects match"
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : view === "board" ? (
            <KanbanBoard
              projects={filtered}
              allProjects={projects}
              members={members}
              canEdit={canManage}
              onCreate={(columnStatus) => setDialog({ open: true, status: columnStatus })}
              onMove={(move) => moveProject.mutate(move, { onError: (error) => toast.error(errorMessage(error, "Could not move the project.")) })}
            />
          ) : (
            <ProjectsTable projects={filtered} members={members} />
          )}
        </>
      )}

      <ProjectFormDialog open={dialog.open} onOpenChange={(open) => setDialog((state) => ({ ...state, open }))} defaults={{ status: dialog.status }} />
    </>
  );
}
