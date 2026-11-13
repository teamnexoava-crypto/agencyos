import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Check, MessageCircle, ReceiptText, TriangleAlert, UsersRound } from "lucide-react";
import { useForm, useWatch, type FieldPath, type FieldValues, type UseFormReturn } from "react-hook-form";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { TAX_MODES } from "@shared/constants";
import { formatInvoiceNumber } from "@shared/schemas/workspace";
import {
  settingsInvoicingSchema,
  settingsMessagesSchema,
  settingsProfileSchema,
  type SettingsInvoicingInput,
  type SettingsMessagesInput,
  type SettingsProfileInput,
} from "@shared/schemas/settings";
import type { WorkspaceSettings } from "@shared/types";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/api";
import { LogoUploader } from "@/features/onboarding/logo-uploader";
import { useDeleteWorkspace, useSaveSettings, useSettings } from "@/features/settings/api";
import { SettingsCard } from "@/features/settings/section";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;
const TAX_LABEL = { none: "No tax", cgst_sgst: "GST (CGST + SGST)", igst: "GST (IGST)" } as const;
const BRAND_SWATCHES = ["#6366f1", "#2563eb", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#18181b"];

/** Copies field errors returned by the API onto the form, and shows the message as a toast. */
function showSaveError<T extends FieldValues>(form: UseFormReturn<T>, error: unknown) {
  if (error instanceof ApiError) {
    for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<T>, { message });
  }
  toast.error(errorMessage(error, "Could not save your settings."));
}

/* ------------------------------------------------------------------------------------------------ profile */

function ProfileForm({ settings }: { settings: WorkspaceSettings }) {
  const save = useSaveSettings();
  const form = useForm<SettingsProfileInput>({
    resolver: zodResolver(settingsProfileSchema),
    defaultValues: {
      name: settings.name,
      email: settings.email,
      phone: settings.phone,
      website: settings.website,
      address: settings.address,
      gstNumber: settings.gstNumber,
      brandColor: settings.brandColor,
    },
  });
  const brandColor = useWatch({ control: form.control, name: "brandColor" });

  const submit = form.handleSubmit((input) =>
    save.mutate(
      { section: "profile", input },
      {
        onSuccess: () => {
          form.reset(input);
          toast.success("Profile saved");
        },
        onError: (error) => showSaveError(form, error),
      },
    ),
  );

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="border-b px-5 py-4 sm:px-6">
          <h2 className="text-[15px] font-semibold">Logo</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Shown in the sidebar, on invoices, contracts and your clients' pages.</p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <LogoUploader logoUrl={settings.logoUrl} />
        </div>
      </section>

      <Form {...form}>
        <SettingsCard title="Agency profile" description="These details appear on your invoices and contracts." saving={save.isPending} dirty={form.formState.isDirty} onSubmit={() => void submit()}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Agency name</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email {optional}</FormLabel>
                  <FormControl>
                    <Input type="email" inputMode="email" placeholder="hello@yourstudio.com" autoComplete="email" {...field} />
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
                    <Input type="tel" inputMode="tel" placeholder="+91 98765 43210" autoComplete="tel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website {optional}</FormLabel>
                  <FormControl>
                    <Input inputMode="url" placeholder="yourstudio.com" autoComplete="url" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="gstNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GSTIN / tax ID {optional}</FormLabel>
                  <FormControl>
                    <Input placeholder="22AAAAA0000A1Z5" autoComplete="off" className="uppercase" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address {optional}</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Street, city, state, PIN" autoComplete="street-address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="brandColor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand colour</FormLabel>
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Brand colour">
                  {BRAND_SWATCHES.map((color) => {
                    const selected = brandColor.toLowerCase() === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`Colour ${color}`}
                        onClick={() => field.onChange(color)}
                        className={cn("flex size-8 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-card transition-shadow", selected && "ring-2 ring-foreground/60")}
                        style={{ backgroundColor: color }}
                      >
                        {selected && <Check className="size-4" strokeWidth={3} />}
                      </button>
                    );
                  })}
                  <label className="ml-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                    <FormControl>
                      <input type="color" value={field.value} onChange={(event) => field.onChange(event.target.value)} className="size-8 cursor-pointer rounded-full border bg-transparent p-0.5" aria-label="Custom brand colour" />
                    </FormControl>
                    Custom
                  </label>
                </div>
                <FormDescription>The accent on your invoices, contracts and client pages.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="text-[13px] text-muted-foreground">
            Currency: <span className="font-medium text-foreground">{settings.currency}</span>. It's fixed once a workspace is set up, because existing invoices and expenses are recorded in it.
          </p>
        </SettingsCard>
      </Form>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ invoicing */

function InvoicingForm({ settings }: { settings: WorkspaceSettings }) {
  const save = useSaveSettings();
  const form = useForm<SettingsInvoicingInput>({
    resolver: zodResolver(settingsInvoicingSchema),
    defaultValues: {
      invoicePrefix: settings.invoicePrefix,
      invoiceNextNumber: settings.invoiceNextNumber,
      invoiceDueDays: settings.invoiceDueDays,
      defaultTaxMode: settings.defaultTaxMode,
      defaultTaxRate: settings.defaultTaxRate,
      invoiceNotes: settings.invoiceNotes,
      invoiceTerms: settings.invoiceTerms,
      bankDetails: settings.bankDetails,
      upiId: settings.upiId,
    },
  });
  const [prefix, nextNumber, taxMode] = useWatch({ control: form.control, name: ["invoicePrefix", "invoiceNextNumber", "defaultTaxMode"] });

  const submit = form.handleSubmit((input) =>
    save.mutate(
      { section: "invoicing", input },
      {
        onSuccess: () => {
          form.reset(input);
          toast.success("Invoice settings saved");
        },
        onError: (error) => showSaveError(form, error),
      },
    ),
  );
  const numberField = (onChange: (value: number) => void) => (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value));

  return (
    <Form {...form}>
      <SettingsCard title="Invoices and tax" description="Defaults for every new invoice. You can still change them on each invoice." saving={save.isPending} dirty={form.formState.isDirty} onSubmit={() => void submit()}>
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="invoicePrefix"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number prefix</FormLabel>
                <FormControl>
                  <Input autoComplete="off" className="uppercase" maxLength={10} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="invoiceNextNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Next number</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="numeric" min={settings.invoiceMinNextNumber} step={1} {...field} value={Number.isNaN(field.value) ? "" : field.value} onChange={numberField(field.onChange)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="invoiceDueDays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment due in (days)</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="numeric" min={0} max={365} step={1} {...field} value={Number.isNaN(field.value) ? "" : field.value} onChange={numberField(field.onChange)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p className="-mt-2 text-[13px] text-muted-foreground">
          Your next invoice will be <span className="tabular font-medium text-foreground">{formatInvoiceNumber((prefix || "INV").toUpperCase(), Number.isFinite(nextNumber) ? nextNumber : settings.invoiceNextNumber)}</span>.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="defaultTaxMode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default tax</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
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
                <FormMessage />
              </FormItem>
            )}
          />
          {taxMode !== "none" && (
            <FormField
              control={form.control}
              name="defaultTaxRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.01}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={Number.isNaN(field.value) ? "" : field.value / 100}
                      onChange={(event) => field.onChange(event.target.value === "" ? Number.NaN : Math.round(Number(event.target.value) * 100))}
                    />
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
            name="upiId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>UPI ID {optional}</FormLabel>
                <FormControl>
                  <Input placeholder="yourstudio@okhdfcbank" autoComplete="off" {...field} />
                </FormControl>
                <FormDescription>Adds a scan-to-pay QR code to invoices.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bankDetails"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bank details {optional}</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder={"Account name\nAccount number\nIFSC"} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="invoiceNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default note {optional}</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="Thank you for your business!" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="invoiceTerms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default terms {optional}</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Payment is due within 15 days. Late payments may pause work." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </SettingsCard>
    </Form>
  );
}

/* ------------------------------------------------------------------------------------------------ messages */

const MESSAGE_FIELDS: { name: keyof SettingsMessagesInput; label: string; fields: string[] }[] = [
  { name: "waInvoiceTemplate", label: "Invoice message", fields: ["client_name", "invoice_no", "project", "amount", "due_date", "agency_name", "invoice_link"] },
  { name: "waContractTemplate", label: "Contract message", fields: ["client_name", "project", "agency_name", "contract_link"] },
  { name: "waInviteTemplate", label: "Team invite message", fields: ["inviter_name", "agency_name", "invite_link"] },
];

function MessagesForm({ settings }: { settings: WorkspaceSettings }) {
  const save = useSaveSettings();
  const form = useForm<SettingsMessagesInput>({
    resolver: zodResolver(settingsMessagesSchema),
    // Show the built-in message when none is saved, so there is always something to edit.
    defaultValues: {
      waInvoiceTemplate: settings.waInvoiceTemplate || settings.defaults.waInvoiceTemplate,
      waContractTemplate: settings.waContractTemplate || settings.defaults.waContractTemplate,
      waInviteTemplate: settings.waInviteTemplate || settings.defaults.waInviteTemplate,
    },
  });

  const submit = form.handleSubmit((input) => {
    // A message identical to the built-in one is stored as "use the default".
    const payload: SettingsMessagesInput = {
      waInvoiceTemplate: input.waInvoiceTemplate === settings.defaults.waInvoiceTemplate ? "" : input.waInvoiceTemplate,
      waContractTemplate: input.waContractTemplate === settings.defaults.waContractTemplate ? "" : input.waContractTemplate,
      waInviteTemplate: input.waInviteTemplate === settings.defaults.waInviteTemplate ? "" : input.waInviteTemplate,
    };
    save.mutate(
      { section: "messages", input: payload },
      {
        onSuccess: () => {
          form.reset(input);
          toast.success("Messages saved");
        },
        onError: (error) => showSaveError(form, error),
      },
    );
  });

  return (
    <Form {...form}>
      <SettingsCard title="WhatsApp messages" description="The text that's ready to send when you share an invoice, a contract or a team invite. You can still edit it each time." saving={save.isPending} dirty={form.formState.isDirty} onSubmit={() => void submit()}>
        {MESSAGE_FIELDS.map((message) => (
          <FormField
            key={message.name}
            control={form.control}
            name={message.name}
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-3">
                  <FormLabel>{message.label}</FormLabel>
                  {field.value !== settings.defaults[message.name] && (
                    <button type="button" className="text-[13px] font-medium text-primary hover:underline" onClick={() => form.setValue(message.name, settings.defaults[message.name], { shouldDirty: true, shouldValidate: true })}>
                      Reset to default
                    </button>
                  )}
                </div>
                <FormControl>
                  <Textarea rows={3} maxLength={600} {...field} />
                </FormControl>
                <FormDescription>
                  Filled in for you:{" "}
                  {message.fields.map((name, index) => (
                    <span key={name}>
                      {index > 0 && ", "}
                      <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{`{${name}}`}</code>
                    </span>
                  ))}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </SettingsCard>
    </Form>
  );
}

/* ------------------------------------------------------------------------------------------------ danger zone */

function DangerZone({ name }: { name: string }) {
  const remove = useDeleteWorkspace();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === name;

  return (
    <section className="overflow-hidden rounded-2xl border border-destructive/30 bg-card shadow-soft">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <TriangleAlert className="size-4 text-destructive" /> Delete this workspace
          </h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">Permanently deletes every project, client, invoice, contract, expense and file in {name}, for everyone on the team. This can't be undone.</p>
        </div>
        <Button variant="destructive" className="shrink-0" onClick={() => setOpen(true)}>
          Delete workspace
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>Everything in this workspace will be deleted for good, including signed contracts and uploaded files. Client links will stop working immediately.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!matches) return;
              remove.mutate(typed, {
                // A full page load: the session now points at another workspace, or none.
                onSuccess: () => window.location.assign("/app"),
                onError: (error) => toast.error(errorMessage(error, "Could not delete the workspace.")),
              });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="confirm-workspace-name">
                Type <span className="font-semibold">{name}</span> to confirm
              </Label>
              <Input id="confirm-workspace-name" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={!matches || remove.isPending}>
                {remove.isPending ? "Deleting…" : "Delete everything"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ page */

const TABS = [
  { value: "profile", label: "Profile", icon: Building2 },
  { value: "invoicing", label: "Invoices & tax", icon: ReceiptText },
  { value: "messages", label: "Messages", icon: MessageCircle },
  { value: "team", label: "Team", icon: UsersRound },
] as const;

export default function SettingsPage() {
  const { role } = useSession();
  const { data: settings, isPending, isError, refetch } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.some((item) => item.value === requested) ? (requested as string) : "profile";

  return (
    <>
      <PageHeader title="Settings" description="Workspace profile, branding and defaults." />
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid max-w-3xl gap-6" role="status" aria-label="Loading settings">
          <Skeleton className="h-10 w-80 rounded-lg" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(value) => setSearchParams(value === "profile" ? {} : { tab: value }, { replace: true })} className="max-w-3xl">
          <TabsList aria-label="Settings sections">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                <item.icon /> {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="profile" forceMount className="data-[state=inactive]:hidden">
            <div className="grid gap-6">
              <ProfileForm settings={settings} />
              {role === "owner" && <DangerZone name={settings.name} />}
            </div>
          </TabsContent>
          <TabsContent value="invoicing" forceMount className="data-[state=inactive]:hidden">
            <InvoicingForm settings={settings} />
          </TabsContent>
          <TabsContent value="messages" forceMount className="data-[state=inactive]:hidden">
            <MessagesForm settings={settings} />
          </TabsContent>
          <TabsContent value="team" forceMount className="data-[state=inactive]:hidden">
            <SettingsCard title="Team and roles" description="Who can see and do what in this workspace.">
              <dl className="grid gap-3 text-sm">
                {[
                  ["Owner", "Everything, including deleting the workspace."],
                  ["Admin", "Everything except deleting the workspace: projects, clients, money, contracts, team."],
                  ["Member", "Only the projects they're assigned to. No budgets, invoices, expenses, contracts or client details."],
                ].map(([name, text]) => (
                  <div key={name} className="grid gap-x-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <dt className="font-medium">{name}</dt>
                    <dd className="text-muted-foreground">{text}</dd>
                  </div>
                ))}
              </dl>
              <Button asChild variant="outline" className="w-fit">
                <Link to="/app/team">
                  <UsersRound /> Manage team
                </Link>
              </Button>
            </SettingsCard>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
