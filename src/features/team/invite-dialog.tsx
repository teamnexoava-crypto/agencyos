import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, LoaderCircle, Mail, MessageCircle } from "lucide-react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { inviteSchema, type InviteInput } from "@shared/schemas/team";
import type { InviteDTO } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/features/auth/api";
import { ApiError, errorMessage } from "@/lib/api";
import { useCreateInvite } from "./api";
import { useInviteShare, type ShareProps } from "./share";

function InviteReady({ invite, template, onDone }: ShareProps & { onDone: () => void }) {
  const share = useInviteShare({ invite, template });
  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
        <p>
          Invite created for <span className="font-medium">{invite.email}</span>. Send them this link – it works for 7 days and only with that Google account.
        </p>
      </div>
      <div className="flex gap-2">
        <Input readOnly value={share.link} aria-label="Invite link" onFocus={(event) => event.target.select()} className="tabular sm:text-[13px]" />
        <Button variant="outline" onClick={share.copy} className="shrink-0">
          <Copy /> Copy
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild className="bg-[#25D366] text-white hover:bg-[#1fb957]">
          <a href={share.whatsappHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> Share on WhatsApp
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={share.mailHref}>
            <Mail /> Send by email
          </a>
        </Button>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

function InviteForm({ onCreated, onCancel }: { onCreated: (invite: InviteDTO) => void; onCancel: () => void }) {
  const { isOwner } = useSession();
  const createInvite = useCreateInvite();
  const form = useForm<InviteInput>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", role: "member", designation: "" } });

  const onSubmit = form.handleSubmit((input) =>
    createInvite.mutate(input, {
      onSuccess: onCreated,
      onError: (error) => {
        if (error instanceof ApiError) {
          for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<InviteInput>, { message });
        }
        toast.error(errorMessage(error, "Could not create the invite."));
      },
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Their Google email</FormLabel>
              <FormControl>
                <Input type="email" inputMode="email" placeholder="name@gmail.com" autoComplete="off" autoFocus {...field} />
              </FormControl>
              <FormDescription>They'll sign in with Google using this address.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    {isOwner && <SelectItem value="admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="designation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Designation <span className="font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Designer" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Members</span> see only the projects they're assigned to and never see money.{" "}
          <span className="font-medium text-foreground">Admins</span> see everything except role changes.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={createInvite.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={createInvite.isPending}>
            {createInvite.isPending && <LoaderCircle className="animate-spin" />} Create invite link
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: string;
}

export function InviteDialog({ open, onOpenChange, template }: InviteDialogProps) {
  const [created, setCreated] = useState<InviteDTO | null>(null);
  const handleOpenChange = (next: boolean) => {
    if (!next) setCreated(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{created ? "Invite ready to share" : "Invite a teammate"}</DialogTitle>
          <DialogDescription>{created ? "We don't send emails for you – share the link yourself." : "Create a private link they can use to join your workspace."}</DialogDescription>
        </DialogHeader>
        {open && (created ? <InviteReady invite={created} template={template} onDone={() => handleOpenChange(false)} /> : <InviteForm onCreated={setCreated} onCancel={() => handleOpenChange(false)} />)}
      </DialogContent>
    </Dialog>
  );
}
