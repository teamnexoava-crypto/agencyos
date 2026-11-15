import { ArrowLeft, Copy } from "lucide-react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import type { InvoiceInput } from "@shared/schemas/invoice";
import type { ClientDTO, InvoiceDefaults, InvoiceDetail, ProjectSummary } from "@shared/types";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useClients } from "@/features/clients/api";
import { useInvoice, useInvoiceDefaults } from "@/features/invoices/api";
import { InvoiceEditor } from "@/features/invoices/invoice-editor";
import { useProject, useProjects } from "@/features/projects/api";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/format";

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Starting values for "Duplicate invoice": the same work, client and pricing, re-dated to today with the
 * original's payment window. Bank / UPI details come from the current defaults when there are any,
 * because those may have changed since the original went out.
 */
function duplicateValues(source: InvoiceDetail, defaults: InvoiceDefaults, clients: ClientDTO[], projects: ProjectSummary[], today: string): InvoiceInput {
  const clientId = source.clientId && clients.some((client) => client.id === source.clientId) ? source.clientId : "";
  // The client or project may have been deleted since – start without them rather than fail to save.
  const project = projects.find((item) => item.id === source.projectId);
  const gap = daysBetween(source.issueDate, source.dueDate);
  return {
    clientId,
    projectId: project && (!project.clientId || project.clientId === clientId) ? project.id : "",
    issueDate: today,
    dueDate: addDays(today, gap >= 0 ? gap : defaults.dueDays),
    items: source.items.map((item) => ({ description: item.description, quantity: item.quantity, rate: item.rate })),
    discountType: source.discountType,
    discountValue: source.discountValue,
    taxMode: source.taxMode,
    taxRate: source.taxMode === "none" ? defaults.taxRate : source.taxRate,
    notes: source.notes ?? "",
    terms: source.terms ?? "",
    bankDetails: defaults.bankDetails ?? source.bankDetails ?? "",
    upiId: defaults.upiId ?? source.upiId ?? "",
    saveDefaults: false,
  };
}

function FormSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" role="status" aria-label="Loading invoice form">
      <div className="space-y-5">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <Skeleton className="hidden h-[36rem] rounded-2xl lg:block" />
    </div>
  );
}

function Shell({ backTo, title, children }: { backTo: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> {backTo === "/app/invoices" ? "Invoices" : "Back"}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
      {children}
    </>
  );
}

/**
 * /app/invoices/new – optionally `?project=<id>` to pre-fill the client and milestones as line items,
 * or `?duplicate=<invoiceId>` to start from a copy of an existing invoice.
 */
export function NewInvoicePage() {
  const [params] = useSearchParams();
  const duplicateId = params.get("duplicate") ?? "";
  const projectId = duplicateId ? "" : (params.get("project") ?? "");
  const clientId = params.get("client") ?? "";
  const defaults = useInvoiceDefaults();
  const clients = useClients();
  const projects = useProjects();
  const project = useProject(projectId, projectId !== "");
  const source = useInvoice(duplicateId, duplicateId !== "");

  // The form copies its starting values once, so wait for defaults fetched for THIS visit (not a cached
  // copy from before Settings were changed). After that, a failed background refresh must not replace
  // a half-written invoice with an error screen – only a missing first load is an error.
  const loading = !defaults.isFetchedAfterMount || clients.isPending || projects.isPending || (projectId !== "" && project.isPending) || (duplicateId !== "" && source.isPending);
  const failed = (defaults.isError && !defaults.isFetchedAfterMount) || (clients.isError && !clients.data) || (projects.isError && !projects.data);

  let body;
  if (duplicateId !== "" && source.isError && !source.data) {
    const missing = source.error instanceof ApiError && source.error.status === 404;
    body = missing ? (
      <ErrorState title="Invoice not found" description="The invoice you wanted to copy may have been deleted." />
    ) : (
      <ErrorState onRetry={() => void source.refetch()} />
    );
  } else if (failed) {
    body = <ErrorState onRetry={() => void Promise.all([defaults.refetch(), clients.refetch(), projects.refetch()])} />;
  } else if (loading || !defaults.data || !clients.data || !projects.data) {
    body = <FormSkeleton />;
  } else if (source.data) {
    body = (
      <>
        <p role="status" className="mb-5 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3 text-[13px] text-foreground">
          <Copy className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Copied from <span className="tabular font-medium">{source.data.number}</span> – check the dates before sending. It gets its own number when you save.
          </span>
        </p>
        <InvoiceEditor
          key={source.data.id}
          number={defaults.data.nextNumber}
          initialValues={duplicateValues(source.data, defaults.data, clients.data, projects.data, todayIso())}
          clients={clients.data}
          projects={projects.data}
        />
      </>
    );
  } else {
    const today = todayIso();
    // Milestones that carry an amount become the line items ("create invoice from a project").
    const milestoneItems = (project.data?.steps ?? []).filter((step) => step.amount !== null && step.amount > 0).map((step) => ({ description: step.title, quantity: 1, rate: step.amount ?? 0 }));
    const initialValues: InvoiceInput = {
      clientId: project.data?.clientId ?? (clients.data.some((client) => client.id === clientId) ? clientId : ""),
      projectId: project.data?.id ?? "",
      issueDate: today,
      dueDate: addDays(today, defaults.data.dueDays),
      items: milestoneItems.length > 0 ? milestoneItems : [{ description: "", quantity: 1, rate: 0 }],
      discountType: "none",
      discountValue: 0,
      taxMode: defaults.data.taxMode,
      taxRate: defaults.data.taxRate,
      notes: defaults.data.notes ?? "",
      terms: defaults.data.terms ?? "",
      bankDetails: defaults.data.bankDetails ?? "",
      upiId: defaults.data.upiId ?? "",
      // Never on by default: creating one invoice must not quietly change what every later invoice starts with.
      saveDefaults: false,
    };
    // Keyed so following a different "new invoice" link (another project, or none) starts a fresh form.
    body = <InvoiceEditor key={`${projectId}|${clientId}`} number={defaults.data.nextNumber} initialValues={initialValues} clients={clients.data} projects={projects.data} />;
  }

  return (
    <Shell backTo="/app/invoices" title="New invoice">
      {body}
    </Shell>
  );
}

/** /app/invoices/:invoiceId/edit */
export function EditInvoicePage() {
  const { invoiceId = "" } = useParams();
  const invoice = useInvoice(invoiceId);
  const clients = useClients();
  const projects = useProjects();
  const backTo = `/app/invoices/${invoiceId}`;

  let body;
  if ((invoice.isError && !invoice.data) || (clients.isError && !clients.data) || (projects.isError && !projects.data)) {
    body = <ErrorState onRetry={() => void Promise.all([invoice.refetch(), clients.refetch(), projects.refetch()])} />;
  } else if (!invoice.data || !clients.data || !projects.data) {
    body = <FormSkeleton />;
  } else if (invoice.data.amountPaid > 0 || invoice.data.status === "cancelled") {
    // Locked invoices can't be edited – the detail page explains why.
    return <Navigate to={backTo} replace />;
  } else {
    const data = invoice.data;
    const initialValues: InvoiceInput = {
      clientId: data.clientId ?? "",
      projectId: data.projectId ?? "",
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      items: data.items.map((item) => ({ description: item.description, quantity: item.quantity, rate: item.rate })),
      discountType: data.discountType,
      discountValue: data.discountValue,
      taxMode: data.taxMode,
      taxRate: data.taxRate,
      notes: data.notes ?? "",
      terms: data.terms ?? "",
      bankDetails: data.bankDetails ?? "",
      upiId: data.upiId ?? "",
      saveDefaults: false,
    };
    body = <InvoiceEditor invoiceId={data.id} number={data.number} initialValues={initialValues} clients={clients.data} projects={projects.data} />;
  }

  return (
    <Shell backTo={backTo} title={invoice.data ? `Edit ${invoice.data.number}` : "Edit invoice"}>
      {body}
    </Shell>
  );
}
