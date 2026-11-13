import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, CalendarDays, FolderKanban, ListChecks, ListOrdered, Mail, Pencil, Phone } from "lucide-react";
import { Link, useParams } from "react-router";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { useMemberMap } from "@/features/members/api";
import { DUE_TONE_CLASS, STEP_STATUS_META } from "@/features/projects/meta";
import { ProjectCard } from "@/features/projects/project-card";
import { useMemberDetail } from "@/features/team/api";
import { MemberEditDialog } from "@/features/team/member-edit-dialog";
import { ApiError } from "@/lib/api";
import { daysUntil, dueLabel, formatMoney, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function MemberDetailPage() {
  const { memberId = "" } = useParams();
  const { canManage, isOwner, membership, workspace } = useSession();
  const { data, isPending, error, refetch } = useMemberDetail(memberId);
  const members = useMemberMap();
  const [editOpen, setEditOpen] = useState(false);

  const back = (
    <Link to="/app/team" className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" /> Team
    </Link>
  );

  if (isPending) {
    return (
      <div role="status" aria-label="Loading member">
        {back}
        <Skeleton className="h-20 rounded-2xl" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 rounded-2xl" />
      </div>
    );
  }
  if (error || !data) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        {back}
        <ErrorState
          title={missing ? "Member not found" : undefined}
          description={missing ? "They may have left the workspace, or you may not have access to their page." : undefined}
          onRetry={missing ? undefined : () => void refetch()}
        />
      </>
    );
  }

  const { member, projects, tasks, steps } = data;
  const isYou = member.id === membership.id;
  const overdue = tasks.filter((task) => task.dueDate && daysUntil(task.dueDate) < 0).length;
  const canEdit = canManage && (isOwner || member.role === "member" || isYou);

  const stats = [
    { label: "Active projects", value: String(projects.filter((project) => project.status !== "completed" && project.status !== "cancelled").length) },
    { label: "Open tasks", value: String(tasks.length) },
    { label: "Overdue tasks", value: String(overdue), tone: overdue > 0 ? "text-destructive" : undefined },
    { label: "Open steps", value: String(steps.length) },
    ...(member.monthlyCost !== null ? [{ label: "Monthly cost", value: formatMoney(member.monthlyCost, workspace.currency) }] : []),
    ...(member.hourlyRate !== null ? [{ label: "Hourly rate", value: formatMoney(member.hourlyRate, workspace.currency) }] : []),
  ];

  return (
    <>
      {back}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-14">
            {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
            <AvatarFallback className="text-lg">{initials(member.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-[28px]">
              <span className="truncate">{member.name}</span>
              {isYou && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">You</span>}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <Badge variant="secondary" className="capitalize">
                {member.role}
              </Badge>
              {member.designation && <span>{member.designation}</span>}
              <a href={`mailto:${member.email}`} className="flex items-center gap-1.5 hover:text-foreground">
                <Mail className="size-3.5" /> {member.email}
              </a>
              {member.phone && (
                <a href={`tel:${member.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 hover:text-foreground">
                  <Phone className="size-3.5" /> {member.phone}
                </a>
              )}
            </div>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setEditOpen(true)} className="shrink-0">
            <Pencil /> Edit
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04 }}
            className="rounded-2xl border bg-card p-5 shadow-soft"
          >
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className={cn("tabular mt-1.5 text-2xl font-semibold tracking-tight", "tone" in stat && stat.tone)}>{stat.value}</dd>
          </motion.div>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="member-tasks">
          <h2 id="member-tasks" className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 text-muted-foreground" /> Open tasks
          </h2>
          {tasks.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No open tasks. All clear.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
              {tasks.map((task) => {
                const due = task.dueDate ? dueLabel(task.dueDate) : null;
                return (
                  <li key={task.id}>
                    <Link to={`/app/projects/${task.projectId}?tab=tasks`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{task.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{task.projectTitle}</span>
                      </span>
                      {due && (
                        <span className={cn("flex shrink-0 items-center gap-1 text-xs", DUE_TONE_CLASS[due.tone])}>
                          <CalendarDays className="size-3.5" /> {due.text}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="member-steps">
          <h2 id="member-steps" className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ListOrdered className="size-4 text-muted-foreground" /> Steps in progress
          </h2>
          {steps.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No milestones assigned right now.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
              {steps.map((step) => {
                const due = step.dueDate ? dueLabel(step.dueDate) : null;
                return (
                  <li key={step.id}>
                    <Link to={`/app/projects/${step.projectId}?tab=steps`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{step.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {step.projectTitle} · {STEP_STATUS_META[step.status].label}
                        </span>
                      </span>
                      {due && (
                        <span className={cn("flex shrink-0 items-center gap-1 text-xs", DUE_TONE_CLASS[due.tone])}>
                          <CalendarDays className="size-3.5" /> {due.text}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="member-projects" className="mt-8">
        <h2 id="member-projects" className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FolderKanban className="size-4 text-muted-foreground" /> Projects
        </h2>
        {projects.length === 0 ? (
          <EmptyState icon={FolderKanban} title="Not on any projects" description="Add them to a project's team from the project page." className="py-10" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} members={members} className="h-full" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <MemberEditDialog open={editOpen} onOpenChange={setEditOpen} member={member} />
    </>
  );
}
