import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheckBig,
  FileSignature,
  FolderKanban,
  Link2,
  MessageCircle,
  PenLine,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { BrandLogo, GoogleIcon } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";
import { Pricing } from "@/features/landing/pricing";
import { cn } from "@/lib/utils";
import { TRIAL_DAYS } from "@shared/plans";

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } } };

/** Fades a block up the first time it scrolls into view. (Reduced-motion users get it without the slide.) */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.4, ease: "easeOut", delay }} className={className}>
      {children}
    </motion.div>
  );
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base text-balance text-muted-foreground sm:text-lg">{text}</p>
    </Reveal>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Product illustrations. Drawn with plain elements (no screenshots to go stale) and hidden from
 * assistive technology – the copy next to each one says the same thing in words.
 * ---------------------------------------------------------------------------------------------- */

const MOCK_BARS = [
  [38, 22],
  [52, 30],
  [44, 26],
  [66, 34],
  [58, 40],
  [82, 44],
];

function DashboardMock() {
  return (
    <div aria-hidden="true" className="relative mx-auto max-w-5xl select-none">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-lift">
        <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-3">
          <span className="size-2.5 rounded-full bg-rose-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 h-5 w-48 rounded-md bg-muted" />
        </div>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Revenue", "₹8.4L", "text-foreground"],
                ["Expenses", "₹3.1L", "text-foreground"],
                ["Profit", "₹5.3L", "text-success"],
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-xl border bg-background/60 p-3 sm:p-4">
                  <p className="text-[11px] text-muted-foreground sm:text-xs">{label}</p>
                  <p className={cn("tabular mt-1 text-base font-semibold tracking-tight sm:text-xl", tone)}>{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border bg-background/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Revenue vs expenses</p>
                <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-(--chart-1)" /> Revenue
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-(--chart-2)" /> Expenses
                  </span>
                </p>
              </div>
              <div className="mt-4 flex h-28 items-end justify-between gap-3 border-b border-border/70 sm:h-36">
                {MOCK_BARS.map(([revenue, expenses], index) => (
                  <div key={index} className="flex h-full flex-1 items-end justify-center gap-1">
                    <motion.span
                      className="w-3 rounded-t bg-(--chart-1) sm:w-4"
                      initial={{ height: 0 }}
                      animate={{ height: `${revenue}%` }}
                      transition={{ duration: 0.6, delay: 0.5 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <motion.span
                      className="w-3 rounded-t bg-(--chart-2) sm:w-4"
                      initial={{ height: 0 }}
                      animate={{ height: `${expenses}%` }}
                      transition={{ duration: 0.6, delay: 0.55 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-background/60 p-4">
            <p className="text-xs font-medium">Active projects</p>
            <ul className="mt-3 space-y-4">
              {[
                ["Website redesign", 75],
                ["Brand identity", 40],
                ["Mobile app", 90],
                ["SEO retainer", 55],
              ].map(([title, progress]) => (
                <li key={title}>
                  <p className="flex justify-between text-[13px]">
                    <span className="font-medium">{title}</span>
                    <span className="tabular text-muted-foreground">{progress}%</span>
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.7, delay: 0.6, ease: [0.16, 1, 0.3, 1] }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, delay: 1.1, ease: "easeOut" }}
        className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lift sm:-left-6"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
          <CircleCheckBig className="size-4" />
        </span>
        <span className="text-[13px]">
          <span className="block font-medium">Invoice paid</span>
          <span className="tabular block text-muted-foreground">INV-0042 · ₹1,18,000</span>
        </span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, delay: 1.3, ease: "easeOut" }}
        className="absolute -top-4 right-4 hidden items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lift sm:-right-6 sm:flex"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <PenLine className="size-4" />
        </span>
        <span className="text-[13px]">
          <span className="block font-medium">Contract signed</span>
          <span className="block text-muted-foreground">by your client, just now</span>
        </span>
      </motion.div>
    </div>
  );
}

function InvoiceMock() {
  return (
    <div aria-hidden="true" className="rounded-2xl border bg-card p-5 shadow-lift select-none sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Invoice</p>
          <p className="tabular text-lg font-semibold">INV-0042</p>
        </div>
        <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Paid</span>
      </div>
      <ul className="mt-5 space-y-2.5 border-y py-4 text-[13px]">
        {[
          ["Design – homepage and 6 inner pages", "₹60,000"],
          ["Development", "₹40,000"],
          ["GST 18%", "₹18,000"],
        ].map(([label, amount]) => (
          <li key={label} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular font-medium">{amount}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-end justify-between">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="tabular text-2xl font-semibold tracking-tight">₹1,18,000</span>
      </p>
      <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#25D366]/12 px-3.5 py-2.5 text-[13px] font-medium text-emerald-800 dark:text-emerald-300">
        <MessageCircle className="size-4" /> Sent on WhatsApp · viewed · paid by UPI
      </div>
    </div>
  );
}

function ContractMock() {
  return (
    <div aria-hidden="true" className="rounded-2xl border bg-card p-5 shadow-lift select-none sm:p-6">
      <p className="text-lg font-semibold">Service agreement</p>
      <div className="mt-3 space-y-2">
        {[92, 100, 84, 96, 60].map((width, index) => (
          <span key={index} className="block h-2 rounded-full bg-muted" style={{ width: `${width}%` }} />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-5">
        {[
          ["Client", "M 4 30 C 14 4, 24 44, 36 22 S 56 6, 68 26 S 88 40, 104 16"],
          ["Agency", "M 4 24 C 18 40, 26 2, 40 24 S 60 44, 72 18 S 92 6, 104 28"],
        ].map(([label, path]) => (
          <div key={label}>
            <svg viewBox="0 0 108 48" className="h-12 w-full text-foreground" fill="none">
              <motion.path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.3, ease: "easeInOut" }} />
            </svg>
            <div className="border-t pt-1.5 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <p className="mt-5 flex items-center gap-2 rounded-xl bg-primary/8 px-3.5 py-2.5 text-[13px] font-medium text-primary">
        <ShieldCheck className="size-4" /> Signed by both parties · audit trail saved
      </p>
    </div>
  );
}

function PortalMock() {
  return (
    <div aria-hidden="true" className="rounded-2xl border bg-card p-5 shadow-lift select-none sm:p-6">
      <p className="text-xs text-muted-foreground">Project for your client</p>
      <p className="text-lg font-semibold">Website redesign</p>
      <p className="tabular mt-4 text-3xl font-semibold tracking-tight">75%</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} whileInView={{ width: "75%" }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} />
      </div>
      <ol className="mt-5 space-y-3 text-[13px]">
        {[
          ["Discovery", true],
          ["Design", true],
          ["Development", true],
          ["Launch", false],
        ].map(([label, done]) => (
          <li key={String(label)} className="flex items-center gap-3">
            <span className={cn("flex size-5 items-center justify-center rounded-full border-2", done ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{done && <Check className="size-3" strokeWidth={3} />}</span>
            <span className={cn(!done && "text-muted-foreground")}>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Content
 * ---------------------------------------------------------------------------------------------- */

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: FolderKanban, title: "Projects and milestones", description: "A kanban board, ordered steps and tasks. Progress updates itself as work gets done." },
  { icon: ReceiptText, title: "GST-ready invoices", description: "Live preview, PDF, UPI QR code, partial payments and one-tap sharing on WhatsApp." },
  { icon: FileSignature, title: "Contracts and e-sign", description: "Reusable templates, a signing page for your client and a tamper-evident audit trail." },
  { icon: Link2, title: "Client portal", description: "One private link per project: progress, invoices, the contract, files and messages." },
  { icon: Wallet, title: "Profit and loss", description: "Income, expenses and profit by month, project and client – without a spreadsheet." },
  { icon: UsersRound, title: "Team and roles", description: "Members see only their projects. Budgets and finances stay with owners and admins." },
];

const SPOTLIGHTS: { eyebrow: string; title: string; text: string; points: string[]; mock: ReactNode }[] = [
  {
    eyebrow: "Invoices",
    title: "Send the invoice. Know when it's seen. Get paid.",
    text: "Create a professional invoice in a minute and share it where your clients already are.",
    points: ["CGST + SGST or IGST worked out for you", "WhatsApp, email or a simple link", "See when it's opened; record part or full payments"],
    mock: <InvoiceMock />,
  },
  {
    eyebrow: "Contracts",
    title: "Agreements signed from a phone, in minutes.",
    text: "Start from your own template – client name, project, amount and dates fill themselves in.",
    points: ["Clients sign by drawing or typing – no account needed", "You counter-sign and both get a signed copy", "Name, time, IP address and a fingerprint of the text are recorded"],
    mock: <ContractMock />,
  },
  {
    eyebrow: "Client portal",
    title: "Stop sending “any update?” replies.",
    text: "Give each client one link that always shows where their project stands.",
    points: ["Live progress and milestones", "Their invoices, contract and shared files in one place", "Never shows your costs, profit, tasks or internal notes"],
    mock: <PortalMock />,
  },
];

const STEPS = [
  { title: "Sign in with Google", text: "No passwords. Add your agency name, logo and GST details once." },
  { title: "Add a client and a project", text: "Break the work into milestones, assign your team, attach files." },
  { title: "Send, sign, get paid", text: "Share the contract, the invoice and the client link. Watch the dashboard fill in." },
];

const FAQS = [
  {
    q: "Is there a free trial?",
    a: `Yes. Every new workspace gets ${TRIAL_DAYS} days with everything unlocked, and no card is needed to start. After that you choose a plan to keep working; your data stays safe either way.`,
  },
  { q: "How do I pay?", a: "By UPI, card or netbanking on Razorpay's secure page. There is no auto-debit: you pay for a month or a year and renew when you choose." },
  { q: "Do my clients need to create an account?", a: "No. Clients open a private link to view an invoice, sign a contract or follow their project. Nothing to install, nothing to remember." },
  { q: "Does it handle GST invoices?", a: "Yes. Add your GSTIN and choose CGST + SGST or IGST – the split is calculated for you and printed on the invoice. Invoices in other currencies work too." },
  { q: "Are the e-signatures valid?", a: "Each signature is recorded with the signer's name, the time, their IP address and device, and a fingerprint of the exact text they agreed to. Electronic signatures are widely accepted for ordinary business agreements; for special documents (like property deeds), check what your local law requires." },
  { q: "What can my team members see?", a: "Members see only the projects they are assigned to. Budgets, invoices, expenses, profit, contracts and client contact details are visible to owners and admins only." },
  { q: "Is my data safe?", a: "Every agency's data is kept separate, connections are encrypted, files are stored privately, and sign-in is handled by Google – we never see or store a password." },
];

function GetStarted({ signedIn, size = "lg" }: { signedIn: boolean; size?: "lg" | "default" }) {
  return signedIn ? (
    <Button asChild size={size}>
      <Link to="/app">
        Open dashboard <ArrowRight />
      </Link>
    </Button>
  ) : (
    <Button asChild size={size} variant="outline" className="bg-card">
      <a href="/api/auth/google">
        <GoogleIcon /> Continue with Google
      </a>
    </Button>
  );
}

/** Public home page: what GrowUpliftOS does, how it works, pricing and common questions. */
export default function LandingPage() {
  const { data: me } = useMe();
  const signedIn = Boolean(me);

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-background">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[44rem] bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div aria-hidden="true" className="absolute -top-48 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <header className="sticky top-0 z-30 border-b border-transparent bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link to="/" aria-label="GrowUpliftOS home" className="rounded-lg">
            <BrandLogo />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            {[
              ["Features", "#features"],
              ["How it works", "#how-it-works"],
              ["Pricing", "#pricing"],
              ["FAQ", "#faq"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link to={signedIn ? "/app" : "/login"}>{signedIn ? "Open dashboard" : "Sign in"}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28">
          <motion.div variants={container} initial="hidden" animate="show" className="mx-auto max-w-3xl pt-14 text-center sm:pt-20">
            <motion.p variants={fadeUp} className="mx-auto w-fit rounded-full border bg-card/70 px-3.5 py-1 text-[13px] font-medium text-muted-foreground shadow-soft backdrop-blur">
              Built for agencies, freelancers and service providers
            </motion.p>
            <motion.h1 variants={fadeUp} className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Run your whole agency from <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">one place</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-xl text-base text-balance text-muted-foreground sm:text-lg">
              Projects, team, invoices, contracts and e-signatures – with a private link your clients will actually use.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <GetStarted signedIn={signedIn} />
              <span className="text-[13px] text-muted-foreground">{TRIAL_DAYS}-day free trial · No card needed</span>
            </motion.div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }} className="mt-14 sm:mt-20">
            <DashboardMock />
          </motion.div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t bg-muted/30 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHeading eyebrow="Everything in one place" title="Replace five tools and a pile of spreadsheets" text="From the first proposal to the final payment, every part of client work lives in one tidy workspace." />
            <motion.ul variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
              {FEATURES.map((feature) => (
                <motion.li key={feature.title} variants={fadeUp} whileHover={{ y: -4 }} className="rounded-2xl border bg-card p-6 shadow-soft transition-shadow duration-200 hover:shadow-lift">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <feature.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </section>

        {/* Spotlights */}
        <section className="mx-auto grid max-w-6xl gap-20 px-5 py-20 sm:gap-28 sm:px-8 sm:py-28" aria-label="How GrowUpliftOS helps">
          {SPOTLIGHTS.map((spotlight, index) => (
            <div key={spotlight.eyebrow} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal className={cn(index % 2 === 1 && "lg:order-2")}>
                <p className="text-sm font-semibold text-primary">{spotlight.eyebrow}</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{spotlight.title}</h2>
                <p className="mt-4 text-base text-muted-foreground">{spotlight.text}</p>
                <ul className="mt-6 space-y-3">
                  {spotlight.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-[15px]">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.1} className="mx-auto w-full max-w-md">
                {spotlight.mock}
              </Reveal>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-y bg-muted/30 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHeading eyebrow="How it works" title="Set up in an afternoon, not a quarter" text="No training, no implementation project. If you can use WhatsApp, you can use GrowUpliftOS." />
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 0.08}>
                  <li className="h-full rounded-2xl border bg-card p-6 shadow-soft">
                    <span className="tabular flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</span>
                    <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <SectionHeading eyebrow="Pricing" title="Simple pricing that grows with you" text={`Try everything free for ${TRIAL_DAYS} days. Then one flat price per workspace – no per-user surprises.`} />
          <Pricing signedIn={signedIn} />
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t bg-muted/30 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <SectionHeading eyebrow="FAQ" title="Questions, answered" text="The things people ask before they sign in." />
            <Reveal className="mt-10 divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
              {FAQS.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium transition-colors hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="px-5 pb-5 text-[15px] text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Reveal className="relative overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center shadow-lift sm:px-12 sm:py-20">
            <div aria-hidden="true" className="absolute -top-32 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
            <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Spend your time on client work, not on admin</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-base text-muted-foreground">Set up your workspace today. Your first project, invoice and contract are a few minutes away.</p>
            <div className="relative mt-8 flex justify-center">
              <GetStarted signedIn={signedIn} />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="relative border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-[13px] text-muted-foreground sm:flex-row sm:px-8">
          <span>© {new Date().getFullYear()} GrowUpliftOS</span>
          <span className="flex gap-5">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Pricing
            </a>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
