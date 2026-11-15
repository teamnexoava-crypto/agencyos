import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, LoaderCircle, PencilLine, Plus, Trash2, UserPlus } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { DISCOUNT_TYPES, TAX_MODES } from "@shared/constants";
import { computeInvoiceTotals, lineAmount } from "@shared/invoice";
import { invoiceSchema, type InvoiceInput } from "@shared/schemas/invoice";
import type { ClientDTO, InvoiceDocument as InvoiceDocumentData, ProjectSummary } from "@shared/types";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/api";
import { ClientFormDialog } from "@/features/clients/client-form-dialog";
import { ApiError, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSaveInvoice } from "./api";
import { InvoiceDocument } from "./invoice-document";

const NO_PROJECT = "__none__";
const NEW_CLIENT = "__new_client__";
const DISCOUNT_LABEL = { none: "No discount", percent: "Percent (%)", fixed: "Fixed amount" } as const;
const TAX_LABEL = { none: "No tax", cgst_sgst: "GST (CGST + SGST)", igst: "GST (IGST)" } as const;
const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

/** Percent text field backed by basis points (18 ⇄ 1800). */
function PercentInput({ value, onChange, ...props }: { value: number; onChange: (basisPoints: number) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const [text, setText] = useState(() => (value === 0 ? "" : String(value / 100)));
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        autoComplete="off"
        className="tabular pr-8"
        value={text}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.]/g, "");
          if (!/^\d{0,3}\.?\d{0,2}$/.test(next)) return;
          setText(next);
          onChange(next === "" || next === "." ? 0 : Math.round(Number.parseFloat(next) * 100));
        }}
        {...props}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}

interface InvoiceEditorProps {
  /** Present → editing an existing invoice. */
  invoiceId?: string;
  /** The number this invoice has (edit) or will get (new). */
  number: string;
  initialValues: InvoiceInput;
  clients: ClientDTO[];
  projects: ProjectSummary[];
}

/** Invoice form with a live, pixel-identical preview of what the client will receive. */
export function InvoiceEditor({ invoiceId, number, initialValues, clients, projects }: InvoiceEditorProps) {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const save = useSaveInvoice(invoiceId);
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const [newClientOpen, setNewClientOpen] = useState(false);

  const form = useForm<InvoiceInput>({ resolver: zodResolver(invoiceSchema), defaultValues: initialValues });
  const items = useFieldArray({ control: form.control, name: "items" });
  const values = useWatch({ control: form.control });

  const preview = useMemo((): InvoiceDocumentData => {
    const lines = (values.items ?? []).map((item, index) => {
      const quantity = Number.isFinite(item?.quantity) ? (item?.quantity ?? 0) : 0;
      const rate = item?.rate ?? 0;
      return { id: String(index), description: item?.description ?? "", quantity, rate, amount: lineAmount({ quantity, rate }) };
    });
    const discountType = values.discountType ?? "none";
    const taxMode = values.taxMode ?? "none";
    const totals = computeInvoiceTotals({ items: lines, discountType, discountValue: values.discountValue ?? 0, taxMode, taxRate: values.taxRate ?? 0 });
    const client = clients.find((item) => item.id === values.clientId);
    const project = projects.find((item) => item.id === values.projectId);
    return {
      number,
      status: "draft",
      issueDate: values.issueDate ?? "",
      dueDate: values.dueDate ?? "",
      currency: workspace.currency,
      items: lines,
      discountType,
      discountValue: values.discountValue ?? 0,
      taxMode,
      taxRate: values.taxRate ?? 0,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      amountPaid: 0,
      notes: values.notes || null,
      terms: values.terms || null,
      bankDetails: values.bankDetails || null,
      upiId: values.upiId || null,
      projectTitle: project?.title ?? null,
      from: { name: workspace.name, logoUrl: workspace.logoUrl, address: workspace.address, gstNumber: workspace.gstNumber, phone: workspace.phone, email: null, brandColor: workspace.brandColor },
      to: {
        name: client?.name ?? "Client name",
        company: client?.company ?? null,
        address: client?.address ?? null,
        gstNumber: client?.gstNumber ?? null,
        email: client?.email ?? null,
      },
    };
  }, [values, clients, projects, workspace, number]);

  const clientProjects = projects.filter((project) => !values.clientId || project.clientId === values.clientId || project.id === values.projectId);

  const onSubmit = form.handleSubmit(
    (input) =>
      save.mutate(input, {
        onSuccess: (invoice) => {
          toast.success(invoiceId ? "Invoice updated" : `Invoice ${invoice.number} created`);
          void navigate(`/app/invoices/${invoice.id}`, { replace: true });
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<InvoiceInput>, { message });
          }
          toast.error(errorMessage(error, "Could not save the invoice."));
        },
      }),
    () => {
      setMobileView("form");
      toast.error("Please fix the highlighted fields.");
    },
  );

  const itemsError = form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message;

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        {/* Mobile: switch between the form and the preview */}
        <SegmentedControl
          label="Editor view"
          fullWidth
          className="mb-4 lg:hidden"
          value={mobileView}
          onChange={setMobileView}
          options={[
            { value: "form", label: "Edit", icon: PencilLine },
            { value: "preview", label: "Preview", icon: Eye },
          ]}
        />

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className={cn("grid gap-5", mobileView === "preview" && "hidden lg:grid")}>
            <Section title="Details">
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-3">
                        <FormLabel>Client</FormLabel>
                        <button type="button" onClick={() => setNewClientOpen(true)} className="-my-1 inline-flex shrink-0 items-center gap-1 rounded-sm text-[13px] leading-none font-medium whitespace-nowrap text-primary hover:underline">
                          <Plus className="size-3.5" /> New client
                        </button>
                      </div>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          // "Add a new client" is an action, not a choice: open the form and keep the current selection.
                          if (value === NEW_CLIENT) return setNewClientOpen(true);
                          field.onChange(value);
                          // A project belongs to one client – drop it if it no longer matches.
                          const project = projects.find((item) => item.id === form.getValues("projectId"));
                          if (project && project.clientId !== value) form.setValue("projectId", "");
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
                              {client.company && <span className="text-muted-foreground">· {client.company}</span>}
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
                      <Select value={field.value === "" ? NO_PROJECT : field.value} onValueChange={(value) => field.onChange(value === NO_PROJECT ? "" : value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_PROJECT}>
                            <span className="text-muted-foreground">No project</span>
                          </SelectItem>
                          {clientProjects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.title}
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
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issue date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Section>

            <Section title="Line items">
              <ul className="grid gap-3">
                {items.fields.map((row, index) => {
                  const line = values.items?.[index];
                  const amount = lineAmount({ quantity: Number.isFinite(line?.quantity) ? (line?.quantity ?? 0) : 0, rate: line?.rate ?? 0 });
                  const errors = form.formState.errors.items?.[index];
                  return (
                    <li key={row.id} className="grid gap-2 rounded-xl border bg-muted/30 p-3">
                      <div className="flex items-start gap-2">
                        <div className="grid flex-1 gap-1">
                          <Label htmlFor={`item-${index}-description`} className="sr-only">
                            Description for line {index + 1}
                          </Label>
                          <Textarea
                            id={`item-${index}-description`}
                            rows={1}
                            placeholder="Description of work"
                            aria-invalid={!!errors?.description}
                            className="min-h-10 resize-y"
                            {...form.register(`items.${index}.description`)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove line ${index + 1}`}
                          disabled={items.fields.length === 1}
                          onClick={() => items.remove(index)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 pr-11">
                        <div>
                          <Label htmlFor={`item-${index}-quantity`} className="sr-only">
                            Quantity for line {index + 1}
                          </Label>
                          <Input
                            id={`item-${index}-quantity`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            placeholder="Qty"
                            aria-invalid={!!errors?.quantity}
                            className="tabular"
                            {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                          />
                        </div>
                        <Controller
                          control={form.control}
                          name={`items.${index}.rate`}
                          render={({ field, fieldState }) => (
                            <MoneyInput
                              currency={workspace.currency}
                              value={field.value === 0 ? null : field.value}
                              onChange={(value) => field.onChange(value ?? 0)}
                              onBlur={field.onBlur}
                              placeholder="Rate"
                              aria-label={`Rate for line ${index + 1}`}
                              aria-invalid={fieldState.invalid}
                            />
                          )}
                        />
                        <p className="tabular truncate text-right text-sm font-medium" aria-label={`Amount for line ${index + 1}`}>
                          {formatMoney(amount, workspace.currency)}
                        </p>
                      </div>
                      {(errors?.description ?? errors?.quantity ?? errors?.rate) && (
                        <p role="alert" className="text-[13px] font-medium text-destructive">
                          {errors?.description?.message ?? errors?.quantity?.message ?? errors?.rate?.message}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {itemsError && (
                <p role="alert" className="-mt-2 text-[13px] font-medium text-destructive">
                  {itemsError}
                </p>
              )}
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => items.append({ description: "", quantity: 1, rate: 0 })} disabled={items.fields.length >= 100}>
                <Plus /> Add line
              </Button>
            </Section>

            <Section title="Discount & tax">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="discountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("discountValue", 0);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DISCOUNT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {DISCOUNT_LABEL[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                {values.discountType !== "none" && (
                  <FormField
                    control={form.control}
                    name="discountValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{values.discountType === "percent" ? "Discount %" : "Discount amount"}</FormLabel>
                        <FormControl>
                          {values.discountType === "percent" ? (
                            // Keyed by type so switching between % and fixed starts with a clean field.
                            <PercentInput key="percent" value={field.value} onChange={field.onChange} placeholder="0" />
                          ) : (
                            <MoneyInput key="fixed" currency={workspace.currency} value={field.value === 0 ? null : field.value} onChange={(value) => field.onChange(value ?? 0)} placeholder="0" />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="taxMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value !== "none" && form.getValues("taxRate") === 0) form.setValue("taxRate", 1800);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TAX_MODES.map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              {TAX_LABEL[mode]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                {values.taxMode !== "none" && (
                  <FormField
                    control={form.control}
                    name="taxRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GST rate</FormLabel>
                        <FormControl>
                          <PercentInput value={field.value} onChange={field.onChange} placeholder="18" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <p className="-mt-2 text-[13px] text-muted-foreground">Use CGST + SGST for clients in your state, IGST for clients in another state.</p>
            </Section>

            <Section title="Payment details & notes">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="upiId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UPI ID {optional}</FormLabel>
                      <FormControl>
                        <Input placeholder="yourname@bank" autoComplete="off" spellCheck={false} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="self-end pb-2 text-[13px] text-muted-foreground">Adds a scan-to-pay QR code to the invoice.</p>
              </div>
              <FormField
                control={form.control}
                name="bankDetails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank details {optional}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder={"Account name\nBank · A/C number\nIFSC"} {...field} />
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
                    <FormLabel>Notes {optional}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Thank you for your business!" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terms {optional}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Payment due within 15 days." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="saveDefaults"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} className="mt-0.5" />
                    <span>
                      Remember tax, payment details, notes and terms for new invoices
                      <span className="block text-[13px] text-muted-foreground">You won't have to type them again next time.</span>
                    </span>
                  </label>
                )}
              />
            </Section>
          </div>

          {/* Live preview */}
          <div className={cn("lg:sticky lg:top-24", mobileView === "form" && "hidden lg:block")}>
            <p className="mb-2 hidden text-xs font-medium tracking-wider text-muted-foreground uppercase lg:block">Live preview</p>
            <div className="lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:rounded-2xl">
              <InvoiceDocument invoice={preview} />
            </div>
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <p className="text-sm text-muted-foreground">
            Total <span className="tabular ml-1 text-base font-semibold text-foreground">{formatMoney(preview.total, workspace.currency)}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button asChild type="button" variant="outline">
              <Link to={invoiceId ? `/app/invoices/${invoiceId}` : "/app/invoices"}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              {invoiceId ? "Save changes" : "Save invoice"}
            </Button>
          </div>
        </div>
      </form>
      {/* Outside the invoice <form>: saving the client must not submit the invoice. */}
      <ClientFormDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onSaved={(client) => {
          form.setValue("clientId", client.id, { shouldDirty: true, shouldValidate: true });
          // A project belongs to one client – a brand-new client has none yet.
          form.setValue("projectId", "");
        }}
      />
    </Form>
  );
}
