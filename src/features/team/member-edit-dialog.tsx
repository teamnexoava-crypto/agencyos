import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { memberUpdateSchema, type MemberUpdateInput } from "@shared/schemas/team";
import type { TeamMemberDTO } from "@shared/types";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/features/auth/api";
import { errorMessage } from "@/lib/api";
import { useUpdateMember } from "./api";

interface MemberEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMemberDTO | null;
}

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

function MemberForm({ member, onOpenChange }: { member: TeamMemberDTO; onOpenChange: (open: boolean) => void }) {
  const { isOwner, workspace } = useSession();
  const update = useUpdateMember(member.id);
  const canChangeRole = isOwner && member.role !== "owner";

  const form = useForm<MemberUpdateInput>({
    resolver: zodResolver(memberUpdateSchema),
    defaultValues: {
      ...(canChangeRole && member.role !== "owner" ? { role: member.role } : {}),
      designation: member.designation ?? "",
      phone: member.phone ?? "",
      monthlyCost: member.monthlyCost,
      hourlyRate: member.hourlyRate,
    },
  });

  const onSubmit = form.handleSubmit((input) =>
    update.mutate(input, {
      onSuccess: () => {
        toast.success(`${member.name} updated`);
        onOpenChange(false);
      },
      onError: (error) => toast.error(errorMessage(error, "Could not update this person.")),
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {canChangeRole && (
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
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="designation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Designation {optional}</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Designer" autoComplete="off" {...field} />
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
                <FormLabel>Phone {optional}</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" placeholder="+91 98765 43210" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="monthlyCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monthly cost {optional}</FormLabel>
                <FormControl>
                  <MoneyInput currency={workspace.currency} value={field.value ?? null} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hourlyRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hourly rate {optional}</FormLabel>
                <FormControl>
                  <MoneyInput currency={workspace.currency} value={field.value ?? null} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p className="-mt-2 text-[13px] text-muted-foreground">Costs are used for profit calculations and are visible to owners and admins only.</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <LoaderCircle className="animate-spin" />} Save changes
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function MemberEditDialog({ open, onOpenChange, member }: MemberEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {member?.name ?? "member"}</DialogTitle>
          <DialogDescription>{member?.email}</DialogDescription>
        </DialogHeader>
        {open && member && <MemberForm member={member} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
