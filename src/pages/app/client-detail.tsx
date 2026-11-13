import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, FolderKanban, Mail, MapPin, MessageCircle, Pencil, Plus, ReceiptText, StickyNote, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { useClient, useDeleteClient } from "@/features/clients/api";
import { ClientFormDialog } from "@/features/clients/client-form-dialog";
import { useInvoices } from "@/features/invoices/api";
import { InvoiceRows } from "@/features/invoices/invoice-list";
import { useMemberMap } from "@/features/members/api";
import { ProjectCard } from "@/features/projects/project-card";
import { ProjectFormDialog } from "@/features/projects/project-form-dialog";
import { ApiError, errorMessage } from "@/lib/api";
import { formatMoney, initials } from "@/lib/format";
import { whatsappUrl } from "@/lib/whatsapp";

export default function ClientDetailPage() {
  const { clientId = "" } = useParams();
  const navigate = useNavigate();
  const { workspace } = useSession();
  const { data: client, isPending, error, refetch } = useClient(clientId);
  const members = useMemberMap();
  const deleteClient = useDeleteClient();
  const invoices = useInvoices({ clientId });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);

  const back = (
    <Link to="/app/clients" className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" /> Clients
    </Link>
  );

  if (isPending) {
    return (
      <div role="status" aria-label="Loading client">
        {back}
        <Skeleton className="h-20 rounded-2xl" />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-56 rounded-2xl" />
      </div>
    );
  }
  if (error || !client) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        {back}
        <ErrorState
          title={missing ? "Client not found" : undefined}
          description={missing ? "This client may have been deleted." : undefined}
          onRetry={missing ? undefined : () => void refetch()}
        />
      </>
    );
  }

  const stats = [
    { label: "Projects", value: String(client.projectCount) },
    { label: "Total billed", value: formatMoney(client.totals.billed, workspace.currency) },
    { label: "Total paid", value: formatMoney(client.totals.paid, workspace.currency) },
  ];

  const contact = [
    client.email && { icon: Mail, label: "Email", value: client.email, href: `mailto:${client.email}` },
    client.whatsapp && { icon: MessageCircle, label: "WhatsApp", value: client.whatsapp, href: whatsappUrl(client.whatsapp) },
    client.gstNumber && { icon: ReceiptText, label: "GSTIN", value: client.gstNumber },
    client.address && { icon: MapPin, label: "Address", value: client.address },
    client.notes && { icon: StickyNote, label: "Internal notes", value: client.notes },
  ].filter((item) => item !== null && item !== "");

  return (
    <>
      {back}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-semibold text-white shadow-soft">
            {initials(client.name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{client.name}</h1>
            {client.company && <p className="truncate text-muted-foreground">{client.company}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {client.whatsapp && (
            <Button asChild variant="outline">
              <a href={whatsappUrl(client.whatsapp)} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete client" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
            className="rounded-2xl border bg-card p-5 shadow-soft"
          >
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="tabular mt-1.5 text-2xl font-semibold tracking-tight">{stat.value}</dd>
          </motion.div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          <section aria-labelledby="client-projects">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="client-projects" className="text-sm font-semibold">
                Projects
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setProjectOpen(true)}>
                <Plus /> New project
              </Button>
            </div>
            {client.projects.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title="No projects for this client"
                description="Create one to start tracking milestones and tasks."
                className="py-10"
                action={
                  <Button onClick={() => setProjectOpen(true)}>
                    <Plus /> New project
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {client.projects.map((project) => (
                  <li key={project.id}>
                    <ProjectCard project={{ ...project, clientName: null }} members={members} className="h-full" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="client-invoices">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="client-invoices" className="text-sm font-semibold">
                Invoices
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link to={`/app/invoices/new?client=${client.id}`}>
                  <Plus /> New invoice
                </Link>
              </Button>
            </div>
            {invoices.isPending ? (
              <Skeleton className="h-24 rounded-2xl" />
            ) : !invoices.data || invoices.data.invoices.length === 0 ? (
              <EmptyState icon={ReceiptText} title="No invoices yet" description="Invoices you send this client will be listed here, with what's been billed and paid." className="py-10" />
            ) : (
              <InvoiceRows invoices={invoices.data.invoices} hide={["client"]} />
            )}
          </section>
        </div>

        <aside aria-label="Contact details" className="h-fit rounded-2xl border bg-card shadow-soft">
          <h2 className="border-b px-5 py-4 text-sm font-semibold">Details</h2>
          {contact.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No contact details yet. Use Edit to add an email, WhatsApp number or address.</p>
          ) : (
            <dl className="divide-y">
              {contact.map((item) => (
                <div key={item.label} className="flex gap-3 px-5 py-3.5">
                  <item.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="mt-0.5 text-sm break-words whitespace-pre-line">
                      {"href" in item && item.href ? (
                        <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                          {item.value}
                        </a>
                      ) : (
                        item.value
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
        </aside>
      </div>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} />
      <ProjectFormDialog open={projectOpen} onOpenChange={setProjectOpen} defaults={{ clientId: client.id, status: "lead" }} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${client.name}?`}
        description="Their projects are kept, but will no longer show a client. This can't be undone from the app."
        onConfirm={() =>
          deleteClient.mutate(client.id, {
            onSuccess: () => {
              toast.success(`${client.name} deleted`);
              void navigate("/app/clients", { replace: true });
            },
            onError: (err) => toast.error(errorMessage(err, "Could not delete the client.")),
          })
        }
      />
    </>
  );
}
