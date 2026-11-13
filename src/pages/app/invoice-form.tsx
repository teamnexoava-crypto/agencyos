import { ArrowLeft } from "lucide-react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import type { InvoiceInput } from "@shared/schemas/invoice";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useClients } from "@/features/clients/api";
import { useInvoice, useInvoiceDefaults } from "@/features/invoices/api";
import { InvoiceEditor } from "@/features/invoices/invoice-editor";
import { useProject, useProjects } from "@/features/projects/api";
import { todayIso } from "@/lib/format";

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

/** /app/invoices/new – optionally `?project=<id>` to pre-fill the client and milestones as line items. */
export function NewInvoicePage() {
  const [params] = useSearchParams();
  const projectId = params.get("project") ?? "";
  const clientId = params.get("client") ?? "";
  const defaults = useInvoiceDefaults();
  const clients = useClients();
  const projects = useProjects();
  const project = useProject(projectId, projectId !== "");

  // The form copies its starting values once, so wait for defaults fetched for THIS visit (not a cached
  // copy from before Settings were changed). After that, a failed background refresh must not replace
  // a half-written invoice with an error screen – only a missing first load is an error.
  const loading = !defaults.isFetchedAfterMount || clients.isPending || projects.isPending || (projectId !== "" && project.isPending);
  const failed = (defaults.isError && !defaults.isFetchedAfterMount) || (clients.isError && !clients.data) || (projects.isError && !projects.data);

  let body;
  if (failed) {
    body = <ErrorState onRetry={() => void Promise.all([defaults.refetch(), clients.refetch(), projects.refetch()])} />;
  } else if (loading || !defaults.data || !clients.data || !projects.data) {
    body = <FormSkeleton />;
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
      // First invoice: remember what's typed. Afterwards the saved defaults are only changed on request.
      saveDefaults: !defaults.data.bankDetails && !defaults.data.upiId && !defaults.data.terms,
    };
    body = <InvoiceEditor number={defaults.data.nextNumber} initialValues={initialValues} clients={clients.data} projects={projects.data} />;
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
