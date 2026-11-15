import { useState } from "react";
import { useDocumentTitle } from "@/lib/document-title";
import {
  ArrowLeft,
  CalendarDays,
  FileSignature,
  FolderOpen,
  LayoutDashboard,
  Link2,
  ListChecks,
  ListOrdered,
  Pencil,
  ReceiptText,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PROJECT_STATUSES, type ProjectStatus } from "@shared/constants";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/features/auth/api";
import { useMemberMap } from "@/features/members/api";
import { useDeleteProject, useProject, useUpdateProject } from "@/features/projects/api";
import { STATUS_META } from "@/features/projects/meta";
import { PriorityBadge, StatusBadge } from "@/features/projects/badges";
import { ProjectContractsTab } from "@/features/contracts/project-contracts-tab";
import { ProjectExpensesTab } from "@/features/finance/project-expenses-tab";
import { ProjectInvoicesTab } from "@/features/invoices/project-invoices-tab";
import { ClientLinkTab } from "@/features/portal/client-link-tab";
import { FilesTab } from "@/features/portal/files-tab";
import { OverviewTab } from "@/features/projects/overview-tab";
import { ProjectFormDialog } from "@/features/projects/project-form-dialog";
import { StepsTab } from "@/features/projects/steps-tab";
import { TasksTab } from "@/features/projects/tasks-tab";
import { ApiError, errorMessage } from "@/lib/api";
import { dueLabel } from "@/lib/format";

interface TabDef {
  value: string;
  label: string;
  icon: LucideIcon;
  /** Owner/admin only. */
  managersOnly?: boolean;
}

const TABS: TabDef[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "steps", label: "Milestones", icon: ListOrdered },
  { value: "tasks", label: "Tasks", icon: ListChecks },
  { value: "expenses", label: "Expenses", icon: Wallet, managersOnly: true },
  { value: "invoices", label: "Invoices", icon: ReceiptText, managersOnly: true },
  { value: "contract", label: "Contract", icon: FileSignature, managersOnly: true },
  { value: "files", label: "Files", icon: FolderOpen },
  { value: "client-link", label: "Client portal", icon: Link2, managersOnly: true },
];

export default function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canManage } = useSession();
  const { data: project, isPending, error, refetch } = useProject(projectId);
  useDocumentTitle(project?.title);
  const members = useMemberMap();
  const updateProject = useUpdateProject(projectId);
  const deleteProject = useDeleteProject();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const tabs = TABS.filter((tab) => canManage || !tab.managersOnly);
  const requested = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.value === requested) ? (requested as string) : "overview";
  const openTab = (value: string) => setSearchParams(value === "overview" ? {} : { tab: value }, { replace: true });

  const back = (
    <Link to="/app/projects" className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" /> Projects
    </Link>
  );

  if (isPending) {
    return (
      <div role="status" aria-label="Loading project">
        {back}
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="mt-3 h-5 w-56" />
        <Skeleton className="mt-8 h-10 w-full max-w-xl" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error || !project) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        {back}
        <ErrorState
          title={missing ? "Project not found" : undefined}
          description={missing ? "It may have been deleted, or you may not be assigned to it." : undefined}
          onRetry={missing ? undefined : () => void refetch()}
        />
      </>
    );
  }

  const closed = project.status === "completed" || project.status === "cancelled";
  const due = project.dueDate ? dueLabel(project.dueDate, closed) : null;

  return (
    <>
      {back}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">{project.title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            {project.clientName &&
              (canManage && project.clientId ? (
                <Link to={`/app/clients/${project.clientId}`} className="font-medium text-foreground hover:text-primary">
                  {project.clientName}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{project.clientName}</span>
              ))}
            {!canManage && <StatusBadge status={project.status} />}
            <PriorityBadge priority={project.priority} />
            {due && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {due.text}
              </span>
            )}
            {project.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={project.status}
              onValueChange={(value) =>
                updateProject.mutate(
                  { status: value as ProjectStatus },
                  {
                    onSuccess: () => toast.success(`Moved to ${STATUS_META[value as ProjectStatus].label}`),
                    onError: (err) => toast.error(errorMessage(err, "Could not change the status.")),
                  },
                )
              }
            >
              <SelectTrigger className="h-9 w-40" aria-label="Project status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PROJECT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
                    {STATUS_META[status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete project" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={openTab}>
        {/* Up to eight sections don't fit across a phone, and a sideways-scrolling strip hides most of
            them. Below `sm` they become a grid of small tiles (icon over label, two rows of four) so
            every section is visible at once; from `sm` up it's the usual underlined strip. */}
        <TabsList aria-label="Project sections" className="max-sm:mx-0 max-sm:grid max-sm:grid-cols-4 max-sm:gap-0.5 max-sm:overflow-visible max-sm:rounded-lg max-sm:border max-sm:bg-card max-sm:p-0.5 max-sm:shadow-soft">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="max-sm:min-w-0 max-sm:flex-col max-sm:justify-center max-sm:gap-1 max-sm:rounded-md max-sm:px-1 max-sm:py-2 max-sm:text-xs max-sm:data-[state=active]:bg-accent max-sm:data-[state=active]:text-accent-foreground max-sm:[&>[data-slot=tabs-underline]]:hidden"
            >
              <tab.icon />
              {tab.label}
              {tab.value === "steps" && project.stepCount > 0 && (
                <span className="tabular rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground max-sm:absolute max-sm:top-1 max-sm:right-1 max-sm:px-1 max-sm:text-[10px]">
                  {project.stepsDone}/{project.stepCount}
                </span>
              )}
              {tab.value === "tasks" && project.taskCount - project.tasksDone > 0 && (
                <span className="tabular rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground max-sm:absolute max-sm:top-1 max-sm:right-1 max-sm:px-1 max-sm:text-[10px]">{project.taskCount - project.tasksDone}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab project={project} members={members} onOpenTab={openTab} />
        </TabsContent>
        <TabsContent value="steps">
          <StepsTab project={project} members={members} />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksTab project={project} members={members} />
        </TabsContent>
        {canManage && (
          <>
            <TabsContent value="expenses">
              <ProjectExpensesTab project={project} />
            </TabsContent>
            <TabsContent value="invoices">
              <ProjectInvoicesTab project={project} />
            </TabsContent>
            <TabsContent value="contract">
              <ProjectContractsTab project={project} />
            </TabsContent>
          </>
        )}
        <TabsContent value="files">
          <FilesTab project={project} members={members} />
        </TabsContent>
        {canManage && (
          <TabsContent value="client-link">
            <ClientLinkTab project={project} />
          </TabsContent>
        )}
      </Tabs>

      {canManage && (
        <>
          <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete this project?"
            description={`"${project.title}" and its milestones and tasks will be removed for everyone.`}
            onConfirm={() =>
              deleteProject.mutate(project.id, {
                onSuccess: () => {
                  toast.success("Project deleted");
                  void navigate("/app/projects", { replace: true });
                },
                onError: (err) => toast.error(errorMessage(err, "Could not delete the project.")),
              })
            }
          />
        </>
      )}
    </>
  );
}
