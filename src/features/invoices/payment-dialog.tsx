import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { PAYMENT_METHODS } from "@shared/constants";
import { paymentSchema, type PaymentInput } from "@shared/schemas/invoice";
import type { InvoiceDetail } from "@shared/types";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, errorMessage } from "@/lib/api";
import { celebrate } from "@/lib/confetti";
import { formatMoney, todayIso } from "@/lib/format";
import { useRecordPayment } from "./api";
import { PAYMENT_METHOD_LABEL } from "./meta";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceDetail;
}

function PaymentForm({ invoice, onOpenChange }: Omit<PaymentDialogProps, "open">) {
  const record = useRecordPayment(invoice.id);
  const balance = invoice.total - invoice.amountPaid;
  const form = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: balance, date: todayIso(), method: "upi", reference: "", notes: "" },
  });

  const onSubmit = form.handleSubmit((input) =>
    record.mutate(input, {
      onSuccess: (updated) => {
        onOpenChange(false);
        if (updated.status === "paid") {
          toast.success(`Invoice ${updated.number} is fully paid 🎉`);
          void celebrate();
        } else {
          toast.success("Payment recorded", { description: `${formatMoney(updated.total - updated.amountPaid, updated.currency)} still due.` });
        }
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<PaymentInput>, { message });
        }
        toast.error(errorMessage(error, "Could not record the payment."));
      },
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount received</FormLabel>
                <FormControl>
                  <MoneyInput currency={invoice.currency} value={field.value === 0 ? null : field.value} onChange={(value) => field.onChange(value ?? 0)} onBlur={field.onBlur} autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" max={todayIso()} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Method</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABEL[method]}
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
            name="reference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Reference <span className="font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="UTR / transaction ID" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={record.isPending}>
            {record.isPending && <LoaderCircle className="animate-spin" />} Record payment
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function PaymentDialog({ open, onOpenChange, invoice }: PaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {invoice.number} · {formatMoney(invoice.total - invoice.amountPaid, invoice.currency)} due. Enter less than that for a part payment.
          </DialogDescription>
        </DialogHeader>
        {open && <PaymentForm invoice={invoice} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
