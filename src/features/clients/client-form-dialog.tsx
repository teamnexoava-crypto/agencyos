import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { clientSchema, type ClientInput } from "@shared/schemas/client";
import type { ClientDTO } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api";
import { useCreateClient, useUpdateClient } from "./api";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  client?: ClientDTO;
  onSaved?: (client: ClientDTO) => void;
}

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

function ClientForm({ client, onOpenChange, onSaved }: Omit<ClientFormDialogProps, "open">) {
  const create = useCreateClient();
  const update = useUpdateClient(client?.id ?? "");
  const saving = create.isPending || update.isPending;

  const form = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: client?.name ?? "",
      company: client?.company ?? "",
      email: client?.email ?? "",
      whatsapp: client?.whatsapp ?? "",
      gstNumber: client?.gstNumber ?? "",
      address: client?.address ?? "",
      notes: client?.notes ?? "",
    },
  });

  const onSubmit = form.handleSubmit((input) => {
    const mutation = client ? update : create;
    mutation.mutate(input, {
      onSuccess: (saved) => {
        toast.success(client ? "Client updated" : "Client added");
        onSaved?.(saved);
        onOpenChange(false);
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<ClientInput>, { message });
        }
        toast.error(errorMessage(error, "Could not save the client."));
      },
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Riya Sen" autoComplete="off" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company {optional}</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Bloom Cafe" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email {optional}</FormLabel>
                <FormControl>
                  <Input type="email" inputMode="email" placeholder="name@company.com" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="whatsapp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>WhatsApp number {optional}</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" placeholder="+91 98765 43210" autoComplete="off" {...field} />
                </FormControl>
                <FormDescription>With country code – used for one-tap sharing.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="gstNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>GST number {optional}</FormLabel>
              <FormControl>
                <Input placeholder="22AAAAA0000A1Z5" spellCheck={false} autoComplete="off" className="tabular uppercase placeholder:normal-case" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Billing address {optional}</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder={"Street, area\nCity, State – PIN"} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Internal notes {optional}</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="Only your team sees this – never the client." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {client ? "Save changes" : "Add client"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: ClientFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>{client ? "Update this client's contact and billing details." : "Add someone you work with. Only the name is required."}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every open starts from fresh default values. */}
        {open && <ClientForm client={client} onOpenChange={onOpenChange} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}
