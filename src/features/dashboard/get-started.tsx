import { motion, type Variants } from "motion/react";
import { ArrowUpRight, FileSignature, FolderKanban, LoaderCircle, ReceiptText, Sparkles, Users, UsersRound, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAddSampleData } from "@/features/sample-data/api";
import { errorMessage } from "@/lib/api";

interface SetupStep {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  managersOnly?: boolean;
}

const SETUP_STEPS: SetupStep[] = [
  { title: "Add your first client", description: "Keep contacts, GST details and WhatsApp numbers in one place.", to: "/app/clients", icon: Users, managersOnly: true },
  { title: "Create a project", description: "Plan milestones, assign tasks and track progress on a kanban board.", to: "/app/projects", icon: FolderKanban, managersOnly: true },
  { title: "Invite your team", description: "Share an invite link and decide who sees what.", to: "/app/team", icon: UsersRound, managersOnly: true },
  { title: "Send an invoice", description: "GST-ready invoices with a public pay link you can share on WhatsApp.", to: "/app/invoices", icon: ReceiptText, managersOnly: true },
  { title: "Get a contract signed", description: "Templates, e-signatures and a tamper-evident audit trail.", to: "/app/contracts", icon: FileSignature, managersOnly: true },
];

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } } };

/** Onboarding checklist shown on the dashboard until the workspace has its first client or project. */
export function GetStarted({ canManage }: { canManage: boolean }) {
  const steps = SETUP_STEPS.filter((step) => canManage || !step.managersOnly);
  const addSample = useAddSampleData();
  return (
    <section aria-labelledby="get-started" className="mb-8">
      {canManage && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
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
      )}
      <div className="mb-3 flex items-center gap-2">
        <h2 id="get-started" className="text-sm font-semibold">
          Get started
        </h2>
        <Badge variant="secondary">{steps.length} steps</Badge>
      </div>
      <motion.ul variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((step) => (
          <motion.li key={step.to} variants={item} whileHover={{ y: -3 }} transition={{ duration: 0.15 }}>
            <Link
              to={step.to}
              className="group flex h-full items-start gap-4 rounded-2xl border bg-card p-5 shadow-soft transition-[box-shadow,border-color] duration-200 hover:border-primary/30 hover:shadow-lift"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <step.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{step.title}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{step.description}</span>
              </span>
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
