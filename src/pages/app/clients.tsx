import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { MessageCircle, MoreHorizontal, Pencil, Plus, Search, Trash2, UserSearch, Users } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { ClientDTO } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useClients, useDeleteClient } from "@/features/clients/api";
import { ClientFormDialog } from "@/features/clients/client-form-dialog";
import { errorMessage } from "@/lib/api";
import { initials } from "@/lib/format";
import { whatsappUrl } from "@/lib/whatsapp";

function ClientAvatar({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {initials(name)}
    </span>
  );
}

export default function ClientsPage() {
  const { data: clients, isPending, isError, refetch } = useClients();
  const deleteClient = useDeleteClient();
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientDTO | undefined>();
  const [deleting, setDeleting] = useState<ClientDTO | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients ?? [];
    return (clients ?? []).filter((client) => `${client.name} ${client.company ?? ""} ${client.email ?? ""} ${client.whatsapp ?? ""}`.toLowerCase().includes(q));
  }, [clients, query]);

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (client: ClientDTO) => {
    setEditing(client);
    setFormOpen(true);
  };

  const addButton = (
    <Button onClick={openCreate}>
      <Plus /> New client
    </Button>
  );

  const rowMenu = (client: ClientDTO) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${client.name}`} className="relative z-10 text-muted-foreground">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openEdit(client)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        {client.whatsapp && (
          <DropdownMenuItem asChild>
            <a href={whatsappUrl(client.whatsapp)} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> Message on WhatsApp
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(client)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <PageHeader title="Clients" description="Everyone you work with, in one place." actions={addButton} />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-2" role="status" aria-label="Loading clients">
          <Skeleton className="mb-5 h-10 w-72" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add your first client to keep their contact details, GST number and WhatsApp in one place."
          action={addButton}
        />
      ) : (
        <>
          <div className="relative mb-5 sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients…" aria-label="Search clients" className="pl-9" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={UserSearch} title="No clients match" description={`Nothing found for "${query}".`} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-soft md:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-[13px] text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Client</th>
                      <th scope="col" className="px-4 py-3 font-medium">Email</th>
                      <th scope="col" className="px-4 py-3 font-medium">WhatsApp</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Projects</th>
                      <th scope="col" className="w-12 px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((client, index) => (
                      <motion.tr
                        key={client.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(index, 12) * 0.025 }}
                        className="relative transition-colors hover:bg-accent/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ClientAvatar name={client.name} />
                            <div className="min-w-0">
                              <Link to={`/app/clients/${client.id}`} className="font-medium after:absolute after:inset-0 hover:text-primary">
                                {client.name}
                              </Link>
                              {client.company && <p className="truncate text-[13px] text-muted-foreground">{client.company}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{client.email ?? "—"}</td>
                        <td className="tabular px-4 py-3 text-muted-foreground">{client.whatsapp ?? "—"}</td>
                        <td className="tabular px-4 py-3 text-right">{client.projectCount}</td>
                        <td className="px-4 py-3">{rowMenu(client)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="grid gap-3 md:hidden">
                {filtered.map((client, index) => (
                  <motion.li
                    key={client.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.03 }}
                    className="relative flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft"
                  >
                    <ClientAvatar name={client.name} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/app/clients/${client.id}`} className="font-medium after:absolute after:inset-0">
                        {client.name}
                      </Link>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {[client.company, `${client.projectCount} project${client.projectCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {rowMenu(client)}
                  </motion.li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "client"}?`}
        description="Their projects are kept, but will no longer show a client. This can't be undone from the app."
        onConfirm={() => {
          if (!deleting) return;
          const name = deleting.name;
          deleteClient.mutate(deleting.id, {
            onSuccess: () => toast.success(`${name} deleted`),
            onError: (error) => toast.error(errorMessage(error, "Could not delete the client.")),
          });
          setDeleting(null);
        }}
      />
    </>
  );
}
