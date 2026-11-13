import { motion, type Variants } from "motion/react";
import { ArrowUpRight, FileSignature, FolderKanban, ReceiptText, Users, UsersRound, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { CURRENCIES } from "@shared/constants";
import { formatInvoiceNumber } from "@shared/schemas/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { WorkspaceLogo } from "@/components/shared/workspace-logo";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/features/auth/api";
import { firstName, greeting } from "@/lib/format";

interface SetupStep {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  managersOnly?: boolean;
}

const SETUP_STEPS: SetupStep[] = [
  { title: "Add your first client", description: "Keep contacts, GST details and WhatsApp numbers in one place.", to: "/app/clients", icon: Users, managersOnly: true },
  { title: "Create a project", description: "Plan milestones, assign tasks and track progress on a kanban board.", to: "/app/projects", icon: FolderKanban },
  { title: "Invite your team", description: "Share an invite link and decide who sees what.", to: "/app/team", icon: UsersRound },
  { title: "Send an invoice", description: "GST-ready invoices with a public pay link you can share on WhatsApp.", to: "/app/invoices", icon: ReceiptText, managersOnly: true },
  { title: "Get a contract signed", description: "Templates, e-signatures and a tamper-evident audit trail.", to: "/app/contracts", icon: FileSignature, managersOnly: true },
];

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } } };

/**
 * Phase 1 home: a welcome + "get started" checklist. The KPI cards, charts, activity feed and
 * deadline lists replace this in Phase 5 once there is financial data to show.
 */
export default function DashboardPage() {
  const { user, workspace, canManage } = useSession();
  const steps = SETUP_STEPS.filter((step) => canManage || !step.managersOnly);
  const currency = CURRENCIES.find((c) => c.code === workspace.currency);

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName(user.name)}`} description={`Here's your starting point for ${workspace.name}.`} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="get-started">
          <div className="mb-3 flex items-center gap-2">
            <h2 id="get-started" className="text-sm font-semibold">
              Get started
            </h2>
            <Badge variant="secondary">{steps.length} steps</Badge>
          </div>

          <motion.ul variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
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

        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          aria-labelledby="workspace-summary"
          className="h-fit overflow-hidden rounded-2xl border bg-card shadow-soft"
        >
          <div className="relative border-b bg-gradient-to-br from-primary/12 via-transparent to-transparent p-5">
            <div className="flex items-center gap-3">
              <WorkspaceLogo name={workspace.name} logoUrl={workspace.logoUrl} className="size-11 rounded-xl" />
              <div className="min-w-0">
                <h2 id="workspace-summary" className="truncate font-semibold">
                  {workspace.name}
                </h2>
                <p className="text-[13px] text-muted-foreground">Workspace</p>
              </div>
            </div>
          </div>
          <dl className="divide-y text-sm">
            {[
              { label: "Currency", value: currency ? `${currency.symbol} ${currency.code}` : workspace.currency },
              ...(canManage
                ? [
                    { label: "Next invoice", value: formatInvoiceNumber(workspace.invoicePrefix, workspace.invoiceNextNumber) },
                    { label: workspace.currency === "INR" ? "GSTIN" : "Tax ID", value: workspace.gstNumber ?? "Not set" },
                  ]
                : []),
              { label: "Phone", value: workspace.phone ?? "Not set" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="tabular truncate font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        </motion.aside>
      </div>
    </>
  );
}
