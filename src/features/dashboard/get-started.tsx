import { useState } from "react";
import { motion, type Variants } from "motion/react";
import { ArrowUpRight, Check, FileSignature, FolderKanban, LoaderCircle, ReceiptText, Sparkles, Users, UsersRound, X, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { SetupProgress } from "@shared/types";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/api";
import { useAddSampleData } from "@/features/sample-data/api";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSetupProgress } from "./setup-progress";

interface SetupStep {
  key: keyof SetupProgress;
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
}

/** The first real job, end to end – in the order it usually happens. */
const SETUP_STEPS: SetupStep[] = [
  { key: "client", title: "Add your first client", description: "Contacts, GST details and a WhatsApp number in one place.", to: "/app/clients", icon: Users },
  { key: "project", title: "Create a project", description: "Plan milestones, assign tasks and track progress.", to: "/app/projects", icon: FolderKanban },
  { key: "invoice", title: "Send an invoice", description: "GST-ready, with a UPI QR code – share it on WhatsApp.", to: "/app/invoices/new", icon: ReceiptText },
  { key: "contract", title: "Send a contract to sign", description: "Start from the ready service agreement; the client signs on their phone.", to: "/app/contracts", icon: FileSignature },
  { key: "team", title: "Invite your team", description: "Share an invite link and decide who sees what.", to: "/app/team", icon: UsersRound },
];

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } } };

const dismissKey = (workspaceId: string) => `get-started:dismissed:${workspaceId}`;
const readDismissed = (workspaceId: string) => {
  try {
    return window.localStorage.getItem(dismissKey(workspaceId)) === "1";
  } catch {
    return false;
  }
};

/** "Want to see it in action first?" – offered while the workspace is still empty. */
function SampleDataOffer() {
  const addSample = useAddSampleData();
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-violet-600 dark:text-violet-400" /> Want to see it in action first?
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Fill your workspace with example clients, projects, invoices, a contract and leads. Remove them with one click later.</p>
      </div>
      <Button
        className="shrink-0"
        disabled={addSample.isPending}
        onClick={() =>
          addSample.mutate(undefined, {
            onSuccess: () => toast.success("Sample data added – have a look around."),
            onError: (error) => toast.error(errorMessage(error, "Could not add the sample data.")),
          })
        }
      >
        {addSample.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Add sample data
      </Button>
    </div>
  );
}

/**
 * The first-day checklist on the dashboard: five real steps with ticks and a progress bar. It stays
 * until every step is done (sample data doesn't count) or the owner hides it. Owners and admins only.
 */
export function GetStarted({ canManage }: { canManage: boolean }) {
  const { workspace } = useSession();
  const { data: progress } = useSetupProgress(canManage);
  const [dismissed, setDismissed] = useState(() => readDismissed(workspace.id));
  if (!canManage || !progress || dismissed) return null;

  const done = SETUP_STEPS.filter((step) => progress[step.key]).length;
  if (done === SETUP_STEPS.length) return null;
  const next = SETUP_STEPS.find((step) => !progress[step.key]);
  const offerSample = !workspace.sampleDataAt && !progress.client && !progress.project;

  const hide = () => {
    try {
      window.localStorage.setItem(dismissKey(workspace.id), "1");
    } catch {
      // Hiding is only a convenience; it simply comes back next time.
    }
    setDismissed(true);
  };

  return (
    <section aria-labelledby="get-started" className="mb-8">
      {offerSample && <SampleDataOffer />}
      <div className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="get-started" className="font-semibold tracking-tight">
              Get started · {done} of {SETUP_STEPS.length} done
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {next ? (
                <>
                  Next up: <span className="font-medium text-foreground">{next.title.toLowerCase()}</span>.
                </>
              ) : null}{" "}
              Five steps to run your first client job end to end.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Hide the checklist" title="Hide the checklist" onClick={hide} className="shrink-0 text-muted-foreground">
            <X />
          </Button>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={SETUP_STEPS.length} aria-valuenow={done} aria-label="Setup progress">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70" initial={false} animate={{ width: `${Math.max(4, (done / SETUP_STEPS.length) * 100)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
        </div>
        <motion.ol variants={container} initial="hidden" animate="show" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {SETUP_STEPS.map((step, index) => {
            const complete = progress[step.key];
            const isNext = step.key === next?.key;
            return (
              <motion.li key={step.key} variants={item}>
                <Link
                  to={step.to}
                  className={cn(
                    "group flex h-full items-start gap-3 rounded-xl border p-4 transition-[box-shadow,border-color,background-color] duration-200",
                    complete ? "border-transparent bg-muted/40" : isNext ? "border-primary/40 bg-primary/5 hover:shadow-lift" : "bg-card hover:border-primary/30 hover:shadow-lift",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      complete ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : isNext ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                    )}
                  >
                    {complete ? <Check className="size-4" strokeWidth={3} /> : <step.icon className="size-4" />}
                    <span className="sr-only">{complete ? "Done: " : `Step ${index + 1}: `}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("text-sm font-medium", complete && "text-muted-foreground line-through decoration-muted-foreground/40")}>{step.title}</span>
                      {!complete && <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
                    </span>
                    {!complete && <span className="mt-1 block text-xs text-muted-foreground">{step.description}</span>}
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </motion.ol>
      </div>
    </section>
  );
}
