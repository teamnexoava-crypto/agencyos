import { useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, CircleCheckBig, ListChecks, LoaderCircle, Target, UsersRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { MemberSummary, ProjectDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/features/auth/api";
import { useMembers } from "@/features/members/api";
import { MemberAvatar } from "@/features/members/member-avatar";
import { MemberChecklist } from "@/features/members/member-select";
import { errorMessage } from "@/lib/api";
import { daysUntil, dueLabel, formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSetProjectMembers } from "./api";
import { DUE_TONE_CLASS } from "./meta";

function TeamDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: members = [] } = useMembers();
  const setMembers = useSetProjectMembers(project.id);
  const [selected, setSelected] = useState(project.memberIds);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(project.memberIds);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Project team</DialogTitle>
          <DialogDescription>Members only see the projects they're assigned to.</DialogDescription>
        </DialogHeader>
        <MemberChecklist members={members} value={selected} onChange={setSelected} className="max-h-72" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setMembers.isPending}>
            Cancel
          </Button>
          <Button
            disabled={setMembers.isPending}
            onClick={() =>
              setMembers.mutate(selected, {
                onSuccess: () => {
                  toast.success("Team updated");
                  onOpenChange(false);
                },
                onError: (error) => toast.error(errorMessage(error, "Could not update the team.")),
              })
            }
          >
            {setMembers.isPending && <LoaderCircle className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Card({ title, icon: Icon, children, index, className }: { title: string; icon: typeof Target; children: React.ReactNode; index: number; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }}
      className={cn("rounded-2xl border bg-card p-5 shadow-soft", className)}
    >
      <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4" />
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

interface OverviewTabProps {
  project: ProjectDetail;
  members: Map<string, MemberSummary>;
  onOpenTab: (tab: string) => void;
}

export function OverviewTab({ project, members, onOpenTab }: OverviewTabProps) {
  const { canManage, workspace } = useSession();
  const [teamOpen, setTeamOpen] = useState(false);

  const closed = project.status === "completed" || project.status === "cancelled";
  const team = project.memberIds.map((id) => members.get(id)).filter((member): member is MemberSummary => member !== undefined);
  const nextSteps = project.steps.filter((step) => step.status !== "completed").slice(0, 4);
  const milestoneTotal = project.steps.reduce((sum, step) => sum + (step.amount ?? 0), 0);
  const tasksOpen = project.taskCount - project.tasksDone;
  const due = project.dueDate ? dueLabel(project.dueDate, closed) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Progress" icon={Target} index={0} className="lg:col-span-2">
        <div className="flex items-end justify-between gap-4">
          <p className="tabular text-4xl font-semibold tracking-tight">{project.progress}%</p>
          <p className="text-sm text-muted-foreground">
            {project.stepCount === 0 ? "Add steps to track progress" : `${project.stepsDone} of ${project.stepCount} steps completed`}
          </p>
        </div>
        <Progress value={project.progress} className="mt-4 h-2.5" label="Project progress" />

        {nextSteps.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Up next</p>
            <ul className="divide-y rounded-xl border">
              {nextSteps.map((step) => {
                const stepDue = step.dueDate ? dueLabel(step.dueDate) : null;
                return (
                  <li key={step.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", step.status === "in_progress" ? "bg-primary" : "bg-muted-foreground/40")} />
                      <span className="truncate">{step.title}</span>
                    </span>
                    {stepDue && <span className={cn("shrink-0 text-xs", DUE_TONE_CLASS[stepDue.tone])}>{stepDue.text}</span>}
                  </li>
                );
              })}
            </ul>
            <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => onOpenTab("steps")}>
              View all steps
            </Button>
          </div>
        )}
      </Card>

      <Card title="Timeline" icon={CalendarDays} index={1}>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Start</dt>
            <dd className="font-medium">{project.startDate ? formatDate(project.startDate) : "Not set"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Due</dt>
            <dd className="font-medium">{project.dueDate ? formatDate(project.dueDate) : "Not set"}</dd>
          </div>
        </dl>
        {due && !closed && project.dueDate && (
          <p className={cn("mt-4 rounded-xl bg-muted/60 px-3.5 py-2.5 text-sm font-medium", DUE_TONE_CLASS[due.tone])}>
            {daysUntil(project.dueDate) > 7 ? `${daysUntil(project.dueDate)} days left` : due.text}
          </p>
        )}
        {closed && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-sm font-medium text-muted-foreground">
            <CircleCheckBig className="size-4" /> {project.status === "completed" ? "Project completed" : "Project cancelled"}
          </p>
        )}
      </Card>

      <Card title="Tasks" icon={ListChecks} index={2}>
        <p className="tabular text-3xl font-semibold tracking-tight">{tasksOpen}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          open {tasksOpen === 1 ? "task" : "tasks"} · {project.tasksDone} done
        </p>
        <Button variant="link" size="sm" className="mt-3 h-auto px-0" onClick={() => onOpenTab("tasks")}>
          Open tasks
        </Button>
      </Card>

      {/* Money is only ever sent to owners and admins – for members `budget` arrives as null. */}
      {canManage && project.budget !== null && (
        <Card title="Budget" icon={Wallet} index={3}>
          <p className="tabular text-3xl font-semibold tracking-tight">{formatMoney(project.budget, workspace.currency)}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Milestone amounts</dt>
              <dd className="tabular font-medium">{formatMoney(milestoneTotal, workspace.currency)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Unallocated</dt>
              <dd className={cn("tabular font-medium", project.budget - milestoneTotal < 0 && "text-destructive")}>
                {formatMoney(project.budget - milestoneTotal, workspace.currency)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Spend and profit appear here once expenses and invoices are tracked.</p>
        </Card>
      )}

      <Card title="Team" icon={UsersRound} index={4}>
        {team.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is assigned yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {team.map((member) => (
              <li key={member.id} className="flex items-center gap-3 text-sm">
                <MemberAvatar member={member} className="size-8 ring-0" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{member.name}</span>
                  <span className="block truncate text-xs text-muted-foreground capitalize">{member.designation ?? member.role}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setTeamOpen(true)}>
            Manage team
          </Button>
        )}
      </Card>

      {project.description && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.25 }}
          className="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-3"
        >
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Description</h2>
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{project.description}</p>
        </motion.section>
      )}

      {canManage && <TeamDialog project={project} open={teamOpen} onOpenChange={setTeamOpen} />}
    </div>
  );
}
