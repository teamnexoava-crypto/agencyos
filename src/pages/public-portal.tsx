import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, CalendarDays, Check, Download, FileSignature, FolderOpen, LinkIcon, LoaderCircle, MessagesSquare, ReceiptText, SendHorizontal } from "lucide-react";
import { useParams } from "react-router";
import { toast } from "sonner";
import type { ContractStatus, ProjectStatus } from "@shared/constants";
import type { PortalData } from "@shared/types";
import { BrandMark } from "@/components/shared/brand";
import { CountUp } from "@/components/shared/count-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceStatusBadge } from "@/features/invoices/status-badge";
import { portalFileUrl, usePortal, usePortalComment } from "@/features/portal/api";
import { FileIcon } from "@/features/portal/file-icon";
import { errorMessage } from "@/lib/api";
import { formatBytes, formatDate, formatMoney, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  lead: { label: "Getting started", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  in_progress: { label: "In progress", tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  on_hold: { label: "On hold", tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  completed: { label: "Completed", tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", tone: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};

/** Contract status in the client's words. */
const CONTRACT_STATUS: Partial<Record<ContractStatus, { label: string; tone: string; action: string }>> = {
  sent: { label: "Waiting for your signature", tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300", action: "Review & sign" },
  viewed: { label: "Waiting for your signature", tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300", action: "Review & sign" },
  client_signed: { label: "Signed by you", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300", action: "View" },
  completed: { label: "Signed", tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", action: "View" },
};

const formatInstant = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const shortDate = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
const NAME_KEY = "aos-portal-name";

function Section({ icon: Icon, title, count, delay, children }: { icon: typeof ReceiptText; title: string; count?: number; delay: number; children: React.ReactNode }) {
  const id = `portal-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <motion.section
      aria-labelledby={id}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border bg-card shadow-soft"
    >
      <h2 id={id} className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" /> {title}
        {count !== undefined && count > 0 && <span className="tabular rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">{count}</span>}
      </h2>
      {children}
    </motion.section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</p>;

function Timeline({ steps, accent }: { steps: PortalData["steps"]; accent: string }) {
  if (steps.length === 0) return <Empty>Milestones will appear here once the plan is set.</Empty>;
  return (
    <ol className="px-5 py-5">
      {steps.map((step, index) => {
        const done = step.status === "completed";
        const active = step.status === "in_progress";
        const last = index === steps.length - 1;
        return (
          <li key={`${step.title}-${index}`} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span aria-hidden="true" className="absolute top-7 bottom-0 left-[13px] w-0.5 rounded-full bg-border" style={done ? { backgroundColor: accent, opacity: 0.45 } : undefined} />}
            <span
              aria-hidden="true"
              className={cn("relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border-2 bg-card text-white", !done && !active && "border-border")}
              style={done ? { backgroundColor: accent, borderColor: accent } : active ? { borderColor: accent } : undefined}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : active ? <span className="size-2.5 animate-pulse rounded-full motion-reduce:animate-none" style={{ backgroundColor: accent }} /> : null}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn("font-medium", !done && !active && "text-muted-foreground")}>{step.title}</p>
              <p className="text-[13px] text-muted-foreground">
                {done ? `Completed${step.completedAt ? ` ${shortDate(step.completedAt)}` : ""}` : active ? "In progress" : "Upcoming"}
                {!done && step.dueDate && ` · Due ${formatDate(step.dueDate)}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Messages({ token, comments, agencyName }: { token: string; comments: NonNullable<PortalData["comments"]>; agencyName: string }) {
  const post = usePortalComment(token);
  const [name, setName] = useState(() => {
    try {
      return window.localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [body, setBody] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const send = () => {
    if (!name.trim() || !body.trim()) return setShowErrors(true);
    post.mutate(
      { name: name.trim(), body: body.trim() },
      {
        onSuccess: () => {
          setBody("");
          setShowErrors(false);
          try {
            window.localStorage.setItem(NAME_KEY, name.trim());
          } catch {
            /* private browsing – fine, they can retype it */
          }
          toast.success(`Sent to ${agencyName}`);
        },
        onError: (error) => toast.error(errorMessage(error, "Could not send your message. Please try again.")),
      },
    );
  };

  return (
    <>
      {comments.length === 0 ? (
        <Empty>Questions or feedback? Leave a message for {agencyName}.</Empty>
      ) : (
        <ul className="max-h-[28rem] space-y-3 overflow-y-auto p-5" aria-live="polite">
          {comments.map((comment) => {
            const mine = comment.authorType === "client";
            return (
              <li key={comment.id} className={cn("flex", mine && "justify-end")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>
                  <p className={cn("mb-0.5 text-xs font-medium", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {comment.authorName}
                    {!mine && ` · ${agencyName}`} · {formatInstant(comment.createdAt)}
                  </p>
                  <p className="break-words whitespace-pre-wrap">{comment.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="grid gap-3 border-t p-4 sm:p-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="portal-name">Your name</Label>
          <Input id="portal-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" aria-invalid={showErrors && !name.trim()} />
          {showErrors && !name.trim() && <p className="text-[13px] text-destructive">Enter your name</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="portal-message">Message</Label>
          <Textarea id="portal-message" rows={3} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={`Write to ${agencyName}…`} aria-invalid={showErrors && !body.trim()} />
          {showErrors && !body.trim() && <p className="text-[13px] text-destructive">Write a message</p>}
        </div>
        <Button type="submit" disabled={post.isPending} className="w-full sm:w-fit">
          {post.isPending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />} Send message
        </Button>
      </form>
    </>
  );
}

/** /p/:token – the client's own page for one project. No login, no app chrome; the API sends client-safe data only. */
export default function PublicPortalPage() {
  const { token = "" } = useParams();
  const { data: portal, isPending } = usePortal(token);

  if (isPending) {
    return (
      <div className="min-h-dvh bg-muted/40 px-4 py-8" role="status" aria-label="Loading project">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-12 w-56 rounded-xl" />
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!portal) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <LinkIcon className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">This page isn't available</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The link may be incorrect, switched off or replaced. Please ask your agency for the current link.</p>
      </div>
    );
  }

  const { agency, project } = portal;
  const accent = agency.brandColor;
  const status = PROJECT_STATUS[project.status];
  const doneSteps = portal.steps.filter((step) => step.status === "completed").length;
  const invoicesDue = portal.invoices?.reduce((sum, invoice) => sum + (invoice.total - invoice.amountPaid), 0) ?? 0;

  return (
    <div className="min-h-dvh bg-muted/40">
      <div aria-hidden="true" className="h-1 w-full" style={{ backgroundColor: accent }} />
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-6 sm:pt-8">
        {agency.logoUrl ? (
          <img src={agency.logoUrl} alt="" className="size-10 shrink-0 rounded-xl border bg-white object-contain" />
        ) : (
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: accent }}>
            {initials(agency.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{agency.name}</p>
          <p className="truncate text-xs text-muted-foreground">{[agency.phone, agency.email].filter(Boolean).join(" · ") || "Project updates"}</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-3xl gap-5 px-4 py-6">
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="rounded-2xl border bg-card p-5 shadow-lift sm:p-7" aria-label="Project overview">
          <p className="text-[13px] text-muted-foreground">{portal.clientName ? `Project for ${portal.clientName}` : "Your project"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{project.title}</h1>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", status.tone)}>{status.label}</span>
          </div>

          <div className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <p className="tabular text-4xl font-semibold tracking-tight">
                <CountUp value={project.progress} format={(value) => `${Math.round(value)}%`} />
              </p>
              <p className="pb-1 text-sm text-muted-foreground">{portal.steps.length > 0 ? `${doneSteps} of ${portal.steps.length} milestones done` : "Progress"}</p>
            </div>
            <div role="progressbar" aria-label="Project progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={project.progress} className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full" style={{ backgroundColor: accent }} initial={{ width: 0 }} animate={{ width: `${project.progress}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }} />
            </div>
          </div>

          {(project.startDate || project.dueDate) && (
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-t pt-5 text-sm">
              {project.startDate && (
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarDays className="size-3.5" /> Started
                  </dt>
                  <dd className="mt-0.5 font-medium">{formatDate(project.startDate)}</dd>
                </div>
              )}
              {project.dueDate && (
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarDays className="size-3.5" /> Expected delivery
                  </dt>
                  <dd className="mt-0.5 font-medium">{formatDate(project.dueDate)}</dd>
                </div>
              )}
            </dl>
          )}
        </motion.section>

        <Section icon={Check} title="Milestones" delay={0.06}>
          <Timeline steps={portal.steps} accent={accent} />
        </Section>

        {portal.contracts && portal.contracts.length > 0 && (
          <Section icon={FileSignature} title="Contract" delay={0.1}>
            <ul className="divide-y">
              {portal.contracts.map((contract) => {
                const meta = CONTRACT_STATUS[contract.status];
                if (!meta) return null;
                const needsSignature = contract.status === "sent" || contract.status === "viewed";
                return (
                  <li key={contract.token} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate font-medium">{contract.title}</p>
                      <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium", meta.tone)}>{meta.label}</span>
                    </div>
                    <Button asChild variant={needsSignature ? "default" : "outline"} size="sm">
                      <a href={`/c/${contract.token}`} target="_blank" rel="noopener noreferrer">
                        {meta.action} <ArrowUpRight />
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {portal.invoices && (
          <Section icon={ReceiptText} title="Invoices" count={portal.invoices.length} delay={0.14}>
            {portal.invoices.length === 0 ? (
              <Empty>No invoices yet.</Empty>
            ) : (
              <>
                <ul className="divide-y">
                  {portal.invoices.map((invoice) => {
                    const balance = invoice.total - invoice.amountPaid;
                    return (
                      <li key={invoice.token}>
                        <a href={`/i/${invoice.token}`} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/40">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <span className="tabular font-medium">{invoice.number}</span>
                              <InvoiceStatusBadge invoice={invoice} />
                            </p>
                            <p className="mt-0.5 text-[13px] text-muted-foreground">{balance > 0 ? `Due ${formatDate(invoice.dueDate)}` : `Issued ${formatDate(invoice.issueDate)}`}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="tabular font-semibold">{formatMoney(invoice.total, invoice.currency)}</p>
                            {invoice.amountPaid > 0 && balance > 0 && <p className="tabular text-xs text-muted-foreground">{formatMoney(balance, invoice.currency)} due</p>}
                          </div>
                          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
                {invoicesDue > 0 && portal.invoices[0] && (
                  <p className="flex items-center justify-between border-t bg-muted/40 px-5 py-3 text-sm">
                    <span className="text-muted-foreground">Total outstanding</span>
                    <span className="tabular font-semibold">{formatMoney(invoicesDue, portal.invoices[0].currency)}</span>
                  </p>
                )}
              </>
            )}
          </Section>
        )}

        {portal.files && (
          <Section icon={FolderOpen} title="Files" count={portal.files.length} delay={0.18}>
            {portal.files.length === 0 ? (
              <Empty>Files shared with you will appear here.</Empty>
            ) : (
              <ul className="divide-y">
                {portal.files.map((file) => (
                  <li key={file.id} className="flex items-center gap-3 px-5 py-3.5">
                    <FileIcon contentType={file.contentType} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {formatBytes(file.size)} · {shortDate(file.createdAt)}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={portalFileUrl(token, file.id)} download={file.name} aria-label={`Download ${file.name}`}>
                        <Download /> <span className="hidden sm:inline">Download</span>
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {portal.comments && (
          <Section icon={MessagesSquare} title="Messages" count={portal.comments.length} delay={0.22}>
            <Messages token={token} comments={portal.comments} agencyName={agency.name} />
          </Section>
        )}

        <footer className="mt-2 flex items-center justify-center gap-2 pb-4 text-xs text-muted-foreground">
          <BrandMark className="size-4" />
          <span>
            Shared with{" "}
            <a href="/" className="font-medium hover:text-foreground">
              AgencyOS
            </a>
          </span>
        </footer>
      </main>
    </div>
  );
}
