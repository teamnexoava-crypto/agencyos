import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { LEAD_STAGES } from "@shared/constants";
import { leadSchema, type LeadInput } from "@shared/schemas/crm";
import type { LeadDTO } from "@shared/types";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/features/auth/api";
import { useMembers } from "@/features/members/api";
import { MemberSelect } from "@/features/members/member-select";
import { ApiError, errorMessage } from "@/lib/api";
import { useCreateLead, useUpdateLead } from "./api";
import { STAGE_META } from "./meta";

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  lead?: LeadDTO;
  onSaved?: (lead: LeadDTO) => void;
}

function LeadForm({ lead, onOpenChange, onSaved }: Omit<LeadFormDialogProps, "open">) {
  const { workspace, canManage } = useSession();
  const { data: members = [] } = useMembers();
  const create = useCreateLead();
  const update = useUpdateLead();
  const saving = create.isPending || update.isPending;

  const form = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: lead?.name ?? "",
      company: lead?.company ?? "",
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      sourceLabel: lead?.sourceLabel ?? "",
      stage: lead?.stage ?? "new",
      value: lead?.value ?? null,
      assigneeId: lead?.assigneeId ?? "",
      followUpDate: lead?.followUpDate ?? "",
    },
  });

  const onSubmit = form.handleSubmit((input) => {
    const done = {
      onSuccess: (saved: LeadDTO) => {
        toast.success(lead ? "Lead updated" : "Lead added");
        onSaved?.(saved);
        onOpenChange(false);
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError) {
          for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<LeadInput>, { message });
        }
        toast.error(errorMessage(error, "Could not save the lead."));
      },
    };
    if (lead) update.mutate({ id: lead.id, input }, done);
    else create.mutate(input, done);
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
                  <Input placeholder="e.g. Rohan Verma" autoComplete="off" autoFocus {...field} />
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
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone / WhatsApp {optional}</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" placeholder="+91 98765 43210" autoComplete="off" {...field} />
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
                  <Input type="email" inputMode="email" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="stage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stage</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LEAD_STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {STAGE_META[stage].label}
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
            name="sourceLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source {optional}</FormLabel>
                <FormControl>
                  <Input placeholder="Referral, Instagram, Website…" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="followUpDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Follow up on {optional}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {canManage && (
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected value {optional}</FormLabel>
                  <FormControl>
                    <MoneyInput currency={workspace.currency} value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        {canManage && (
          <FormField
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assigned to {optional}</FormLabel>
                <FormControl>
                  <MemberSelect members={members} value={field.value} onChange={field.onChange} aria-label="Assigned to" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" />} {lead ? "Save changes" : "Add lead"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function LeadFormDialog({ open, onOpenChange, lead, onSaved }: LeadFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit lead" : "New lead"}</DialogTitle>
          <DialogDescription>{lead ? "Update this lead's details." : "Someone who might become a client. Only the name is required."}</DialogDescription>
        </DialogHeader>
        {open && <LeadForm lead={lead} onOpenChange={onOpenChange} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}
