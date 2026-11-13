import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, UserPlus } from "lucide-react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { contractCreateSchema, type ContractCreateInput } from "@shared/schemas/contract";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/features/clients/api";
import { ClientFormDialog } from "@/features/clients/client-form-dialog";
import { useProjects } from "@/features/projects/api";
import { ApiError, errorMessage } from "@/lib/api";
import { useContractTemplates, useCreateContract } from "./api";

const NONE = "__none__";
const NEW_CLIENT = "__new_client__";
const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

interface CreateContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creating from a project page: client and project are fixed. */
  project?: { id: string; title: string; clientId: string | null };
}

function CreateForm({ project, onOpenChange }: Omit<CreateContractDialogProps, "open">) {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients(!project);
  const { data: projects = [] } = useProjects();
  const { data: templates = [], isPending: templatesLoading } = useContractTemplates();
  const create = useCreateContract();
  const [newClientOpen, setNewClientOpen] = useState(false);

  const form = useForm<ContractCreateInput>({
    resolver: zodResolver(contractCreateSchema),
    defaultValues: { title: project ? `${project.title} – agreement` : "", clientId: project?.clientId ?? "", projectId: project?.id ?? "", templateId: "" },
  });
  const clientId = useWatch({ control: form.control, name: "clientId" });
  const clientProjects = projects.filter((item) => item.clientId === clientId);

  const onSubmit = form.handleSubmit((input) => {
    if (!input.clientId && !project) return form.setError("clientId", { message: "Choose a client" });
    create.mutate(input, {
      onSuccess: (contract) => {
        onOpenChange(false);
        toast.success("Draft created – review it, then send it for signature");
        void navigate(`/app/contracts/${contract.id}`);
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<ContractCreateInput>, { message });
        }
        toast.error(errorMessage(error, "Could not create the contract."));
      },
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        {!project && (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel>Client</FormLabel>
                    <button type="button" onClick={() => setNewClientOpen(true)} className="-my-1 inline-flex items-center gap-1 rounded-sm text-[13px] leading-none font-medium text-primary hover:underline">
                      <Plus className="size-3.5" /> New client
                    </button>
                  </div>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (value === NEW_CLIENT) return setNewClientOpen(true);
                      field.onChange(value);
                      form.setValue("projectId", "");
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={clients.length === 0 ? "Add your first client" : "Choose a client"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NEW_CLIENT} className="font-medium text-primary">
                        <UserPlus className="size-4" /> Add a new client
                      </SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project {optional}</FormLabel>
                  <Select value={field.value || NONE} onValueChange={(value) => field.onChange(value === NONE ? "" : value)} disabled={!clientId}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>No project</SelectItem>
                      {clientProjects.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Website redesign – service agreement" autoComplete="off" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="templateId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Start from</FormLabel>
              <Select value={field.value || NONE} onValueChange={(value) => field.onChange(value === NONE ? "" : value)}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE}>Blank document</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {!templatesLoading && templates.length === 0
                  ? "No templates yet. Add one under Contracts → Templates to reuse your standard terms."
                  : "A template fills in the client, project, amount and dates for you. You can edit everything before sending."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <LoaderCircle className="animate-spin" />} Create draft
          </Button>
        </DialogFooter>
      </form>
      {/* Outside the contract <form>: saving the client must not submit the contract. */}
      <ClientFormDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onSaved={(client) => {
          form.setValue("clientId", client.id, { shouldDirty: true, shouldValidate: true });
          form.setValue("projectId", "");
        }}
      />
    </Form>
  );
}

export function CreateContractDialog({ open, onOpenChange, project }: CreateContractDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New contract</DialogTitle>
          <DialogDescription>{project ? `An agreement for ${project.title}.` : "Pick who it's for and where to start."}</DialogDescription>
        </DialogHeader>
        {open && <CreateForm project={project} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
