import type { ReactNode } from "react";
import { motion } from "motion/react";
import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  FilePlus2,
  FileSignature,
  FolderKanban,
  ListChecks,
  ListOrdered,
  MessageSquare,
  Send,
  Upload,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import type { ActivityItem, DashboardData, DeadlineItem } from "@shared/types";
import { CountUp } from "@/components/shared/count-up";
import { DUE_TONE_CLASS } from "@/features/projects/meta";
import { dueLabel, formatDate, formatMoney, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------------------------------ stat tiles */

interface StatTileProps {
  label: string;
  value: number;
  format: (value: number) => string;
  hint?: ReactNode;
  icon: LucideIcon;
  /** Colours the value – always paired with a word in `hint`/`label`, never the only signal. */
  tone?: "positive" | "negative";
  index: number;
}

export function StatTile({ label, value, format, hint, icon: Icon, tone, index }: StatTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
      className="rounded-2xl border bg-card p-5 shadow-soft transition-shadow duration-200 hover:shadow-lift"
    >
      <dt className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        {label}
        <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
      </dt>
      <dd className={cn("mt-2 text-2xl font-semibold tracking-tight", tone === "positive" && "text-success", tone === "negative" && "text-destructive")}>
        <CountUp value={value} format={format} />
      </dd>
      {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
    </motion.div>
  );
}

/* ------------------------------------------------------------------------------------------------ cards */

export function Panel({ title, action, children, className, index = 0 }: { title: string; action?: ReactNode; children: ReactNode; className?: string; index?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 + index * 0.04, ease: "easeOut" }}
      className={cn("flex flex-col rounded-2xl border bg-card p-5 shadow-soft", className)}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </motion.section>
  );
}

const EmptyLine = ({ children }: { children: ReactNode }) => <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">{children}</p>;

/* ------------------------------------------------------------------------------------------------ deadlines */

const DEADLINE_ICON: Record<DeadlineItem["kind"], LucideIcon> = { project: FolderKanban, step: ListOrdered, task: ListChecks };
const DEADLINE_TAB: Record<DeadlineItem["kind"], string> = { project: "", step: "?tab=steps", task: "?tab=tasks" };

export function DeadlinesList({ items }: { items: DeadlineItem[] }) {
  if (items.length === 0) return <EmptyLine>Nothing due in the next two weeks.</EmptyLine>;
  return (
    <ul className="-mx-2 grid">
      {items.map((item) => {
        const Icon = DEADLINE_ICON[item.kind];
        const due = dueLabel(item.dueDate);
        return (
          <li key={`${item.kind}-${item.id}`}>
            <Link to={`/app/projects/${item.projectId}${DEADLINE_TAB[item.kind]}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                {item.kind !== "project" && <span className="block truncate text-xs text-muted-foreground">{item.projectTitle}</span>}
              </span>
              <span className={cn("shrink-0 text-xs font-medium", DUE_TONE_CLASS[due.tone])}>{due.text}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------------------------------------ overdue invoices */

export function OverdueInvoices({ items, currency }: { items: NonNullable<DashboardData["finance"]>["overdueInvoices"]; currency: string }) {
  if (items.length === 0) return <EmptyLine>No overdue invoices. Nice.</EmptyLine>;
  return (
    <ul className="-mx-2 grid">
      {items.map((invoice) => (
        <li key={invoice.id}>
          <Link to={`/app/invoices/${invoice.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <CalendarClock className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="tabular block truncate text-sm font-medium">{invoice.number}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {invoice.clientName ?? "Client"} · was due {formatDate(invoice.dueDate)}
              </span>
            </span>
            <span className="tabular shrink-0 text-sm font-semibold">{formatMoney(invoice.balance, currency)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------------------------------ activity */

function activityIcon(type: ActivityItem["type"]): LucideIcon {
  if (type === "invoice.paid" || type === "invoice.payment_recorded") return CircleDollarSign;
  if (type === "invoice.viewed" || type === "contract.viewed") return Eye;
  if (type === "invoice.sent" || type === "contract.sent") return Send;
  if (type === "invoice.created") return FilePlus2;
  if (type.startsWith("contract.")) return FileSignature;
  if (type.startsWith("member.") || type === "client.created") return UserPlus;
  if (type === "expense.created") return Wallet;
  if (type === "comment.created") return MessageSquare;
  if (type === "file.uploaded") return Upload;
  if (type === "step.completed" || type === "project.completed") return CheckCircle2;
  if (type === "task.assigned") return ListChecks;
  return FolderKanban;
}

export function ActivityFeed({ items, now }: { items: ActivityItem[]; now: number }) {
  if (items.length === 0) return <EmptyLine>Activity from you and your team will appear here.</EmptyLine>;
  return (
    <ol className="grid gap-3.5">
      {items.map((item) => {
        const Icon = activityIcon(item.type);
        const positive = item.type === "invoice.paid" || item.type === "contract.signed" || item.type === "project.completed";
        const body = (
          <>
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", positive ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block text-sm leading-snug">{item.summary}</span>
              <time className="block text-xs text-muted-foreground">{timeAgo(item.createdAt, now)}</time>
            </span>
          </>
        );
        return (
          <li key={item.id}>
            {item.projectId ? (
              <Link to={`/app/projects/${item.projectId}`} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-accent/50">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
