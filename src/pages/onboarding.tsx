import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, LogOut } from "lucide-react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CURRENCIES } from "@shared/constants";
import { formatInvoiceNumber, onboardingSchema, type OnboardingInput } from "@shared/schemas/workspace";
import { BrandLogo } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLogout, useMe } from "@/features/auth/api";
import { useCompleteOnboarding } from "@/features/onboarding/api";
import { InvoicePreview } from "@/features/onboarding/invoice-preview";
import { LogoUploader } from "@/features/onboarding/logo-uploader";
import { ApiError, errorMessage } from "@/lib/api";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/utils";

type Field = FieldPath<OnboardingInput>;

const STEPS: { title: string; description: string; fields: Field[] }[] = [
  { title: "Your agency", description: "This is how you'll appear to clients.", fields: ["name"] },
  { title: "Business details", description: "Used on invoices and contracts. You can change these later.", fields: ["currency", "gstNumber", "phone", "address"] },
  { title: "Invoicing", description: "Choose how your invoice numbers start.", fields: ["invoicePrefix"] },
];

/** A workspace created at sign-up gets a placeholder name ("Priya's Agency") – don't prefill that. */
const isPlaceholderName = (name: string) => /'s Agency$/.test(name);

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Onboarding progress">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.title} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-200",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary ring-4 ring-ring/20",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className={cn("hidden text-[13px] font-medium whitespace-nowrap sm:block", active ? "text-foreground" : "text-muted-foreground")}>
              {step.title}
            </span>
            {index < STEPS.length - 1 && (
              <span className="relative h-px flex-1 overflow-hidden bg-border">
                <motion.span
                  className="absolute inset-0 origin-left bg-primary"
                  initial={false}
                  animate={{ scaleX: done ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const logout = useLogout();
  const complete = useCompleteOnboarding();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const workspace = me?.workspace ?? null;

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    mode: "onTouched",
    defaultValues: {
      name: workspace && !isPlaceholderName(workspace.name) ? workspace.name : "",
      currency: workspace?.currency ?? "INR",
      gstNumber: workspace?.gstNumber ?? "",
      address: workspace?.address ?? "",
      phone: workspace?.phone ?? "",
      invoicePrefix: workspace?.invoicePrefix ?? "INV",
      sampleData: true,
    },
  });
  const values = useWatch({ control: form.control });

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const handleNext = async () => {
    const valid = await form.trigger(STEPS[step]?.fields);
    if (valid) goTo(step + 1);
  };

  const onSubmit = form.handleSubmit(
    (input) => {
      complete.mutate(input, {
        onSuccess: () => {
          toast.success("You're all set!", { description: `${input.name} is ready to go.` });
          void navigate("/app", { replace: true });
        },
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
            // Surface server-side validation on the right field and jump to the step that owns it.
            let firstStep = STEPS.length - 1;
            for (const [path, message] of Object.entries(error.fields)) {
              const stepIndex = STEPS.findIndex((s) => (s.fields as string[]).includes(path));
              if (stepIndex === -1) continue;
              form.setError(path as Field, { message });
              firstStep = Math.min(firstStep, stepIndex);
            }
            goTo(firstStep);
          }
          toast.error(errorMessage(error, "Could not save your workspace."));
        },
      });
    },
    (errors) => {
      // A field on an earlier step is invalid (e.g. GSTIN vs currency) → take the user there.
      const firstStep = STEPS.findIndex((s) => s.fields.some((field) => field in errors));
      if (firstStep !== -1 && firstStep !== step) goTo(firstStep);
    },
  );

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const currency = values.currency ?? "INR";

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      {/* Form column */}
      <div className="flex min-w-0 flex-col px-5 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut /> Sign out
            </Button>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <p className="text-sm font-medium text-primary">Welcome{me ? `, ${firstName(me.user.name)}` : ""} 👋</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">Let's set up your agency</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">Three quick steps — it takes about a minute.</p>
          </motion.div>

          <div className="mt-8">
            <StepIndicator current={step} />
          </div>

          <Form {...form}>
            <form
              className="mt-8"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                // Enter on an earlier step advances instead of submitting the whole form.
                if (isLast) void onSubmit(event);
                else void handleNext();
              }}
            >
              <div className="relative min-h-[23rem]">
                <AnimatePresence mode="wait" initial={false} custom={direction}>
                  <motion.div
                    key={step}
                    custom={direction}
                    variants={{
                      enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
                      center: { opacity: 1, x: 0 },
                      exit: (dir: number) => ({ opacity: 0, x: dir * -24 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="space-y-6"
                  >
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">{current?.title}</h2>
                      <p className="text-sm text-muted-foreground">{current?.description}</p>
                    </div>

                    {step === 0 && (
                      <>
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Agency name</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. Northwind Studio" autoComplete="organization" autoFocus {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid gap-2">
                          <Label asChild>
                            <span>
                              Logo <span className="font-normal text-muted-foreground">(optional)</span>
                            </span>
                          </Label>
                          <LogoUploader logoUrl={workspace?.logoUrl ?? null} />
                        </div>
                      </>
                    )}

                    {step === 1 && (
                      <>
                        <div className="grid gap-5 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="currency"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger onBlur={field.onBlur} autoFocus>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {CURRENCIES.map((c) => (
                                      <SelectItem key={c.code} value={c.code}>
                                        <span className="tabular w-8 text-muted-foreground">{c.symbol}</span>
                                        {c.code} · {c.name}
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
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Phone <span className="font-normal text-muted-foreground">(optional)</span>
                                </FormLabel>
                                <FormControl>
                                  <Input type="tel" inputMode="tel" placeholder="+91 98765 43210" autoComplete="tel" {...field} />
                                </FormControl>
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
                              <FormLabel>
                                {currency === "INR" ? "GST number" : "Tax ID"} <span className="font-normal text-muted-foreground">(optional)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={currency === "INR" ? "22AAAAA0000A1Z5" : "Tax registration number"}
                                  autoCapitalize="characters"
                                  spellCheck={false}
                                  className="tabular uppercase placeholder:normal-case"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>Printed on your invoices. Leave blank if you're not registered.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="address"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Address <span className="font-normal text-muted-foreground">(optional)</span>
                              </FormLabel>
                              <FormControl>
                                <Textarea rows={3} placeholder={"Street, area\nCity, State – PIN"} autoComplete="street-address" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <FormField
                          control={form.control}
                          name="invoicePrefix"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Invoice prefix</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="INV"
                                  maxLength={10}
                                  autoCapitalize="characters"
                                  spellCheck={false}
                                  autoFocus
                                  className="tabular max-w-40 uppercase"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>Letters, numbers, “-” or “/”. Numbers count up automatically per workspace.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="rounded-xl border bg-muted/40 p-4">
                          <p className="text-[13px] text-muted-foreground">Your invoices will be numbered</p>
                          <p className="tabular mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                            {[1, 2, 3].map((n) => (
                              <span key={n} className="rounded-md border bg-card px-2 py-1 shadow-soft">
                                {formatInvoiceNumber((values.invoicePrefix ?? "").trim().toUpperCase() || "INV", n)}
                              </span>
                            ))}
                            <span className="text-muted-foreground">…</span>
                          </p>
                        </div>
                        <FormField
                          control={form.control}
                          name="sampleData"
                          render={({ field }) => (
                            <FormItem className="flex items-start gap-3 rounded-xl border bg-primary/5 p-4">
                              <FormControl>
                                <Checkbox className="mt-0.5" checked={field.value ?? false} onCheckedChange={(checked) => field.onChange(checked === true)} />
                              </FormControl>
                              <div className="grid gap-1">
                                <FormLabel className="!mt-0 font-medium">Start with sample data</FormLabel>
                                <FormDescription>
                                  Example clients, projects, invoices, a contract and leads, so you can see what every screen does. Remove it with one click whenever you're ready.
                                </FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0 || complete.isPending} className={cn(step === 0 && "invisible")}>
                  <ArrowLeft /> Back
                </Button>
                <Button type="submit" size="lg" disabled={complete.isPending} className="min-w-36">
                  {complete.isPending ? (
                    <>
                      <LoaderCircle className="animate-spin" /> Saving…
                    </>
                  ) : isLast ? (
                    <>
                      Finish setup <Check />
                    </>
                  ) : (
                    <>
                      Continue <ArrowRight />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>

      {/* Live preview column (desktop only) */}
      <aside className="relative hidden overflow-hidden border-l bg-muted/40 lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12" aria-label="Preview">
        <div aria-hidden="true" className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div aria-hidden="true" className="absolute top-1/4 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <motion.div
          initial={{ opacity: 0, y: 20, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: -1.5 }}
          transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
          className="relative w-full max-w-md"
        >
          <InvoicePreview
            name={values.name ?? ""}
            logoUrl={workspace?.logoUrl ?? null}
            currency={currency}
            gstNumber={values.gstNumber ?? ""}
            address={values.address ?? ""}
            phone={values.phone ?? ""}
            invoicePrefix={values.invoicePrefix ?? ""}
          />
        </motion.div>
        <p className="relative mt-8 text-sm text-muted-foreground">Live preview — updates as you type</p>
      </aside>
    </div>
  );
}
