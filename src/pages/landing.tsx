import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import {
  ArrowRight,
  BadgeIndianRupee,
  Briefcase,
  Check,
  CircleCheckBig,
  Clapperboard,
  Code2,
  FileSignature,
  FolderKanban,
  Link2,
  Lock,
  Megaphone,
  MessageCircle,
  Palette,
  PenLine,
  PenTool,
  PlayCircle,
  Plus,
  ReceiptText,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { BrandLogo, GoogleIcon } from "@/components/shared/brand";
import { WhatsAppIcon, WhatsAppSupportButton } from "@/components/shared/whatsapp-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";
import { DemoVideo } from "@/features/landing/demo-video";
import { InAppBrowserNotice } from "@/features/landing/in-app-browser-notice";
import { Pricing } from "@/features/landing/pricing";
import { useDisplayCurrency } from "@/features/landing/use-display-currency";
import { whatsappSupportUrl } from "@/lib/support";
import { cn } from "@/lib/utils";
import { DEMO_VIDEO_ID, SUPPORT_WHATSAPP_DISPLAY } from "@shared/constants";
import { PLANS, TRIAL_DAYS, formatPlanPrice, type BillingCurrency } from "@shared/plans";

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

/** The everyday mess the product replaces, and what it looks like afterwards. */
const BEFORE = [
  "Invoices made in Word or Excel, and payments tracked in your head",
  "Clients messaging “any update?” every other day",
  "Contracts sent as PDFs that nobody prints, signs or sends back",
  "Team updates lost in five different WhatsApp groups",
  "No idea which client or project actually made money",
];
const AFTER = [
  "A GST invoice with a UPI QR code, sent on WhatsApp in a minute",
  "One client link that always shows the latest progress",
  "Contracts signed on the client's phone, with a full audit trail",
  "Every task, file and deadline in one place for the whole team",
  "Profit by month, client and project – worked out for you",
];

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: ReceiptText, title: "GST invoices that get paid", description: "CGST + SGST or IGST worked out, a UPI QR code on every invoice, PDF and one-tap WhatsApp sharing." },
  { icon: FileSignature, title: "Contracts and e-sign", description: "Fill a template, send a link, and your client signs on their phone. Name, time and IP are recorded." },
  { icon: Link2, title: "Client portal", description: "One private link per project with progress, invoices, the contract and files. Fewer follow-up calls." },
  { icon: FolderKanban, title: "Projects and tasks", description: "Milestones, a kanban board, due dates and files. Progress updates itself as work gets done." },
  { icon: Target, title: "CRM for leads", description: "Track every enquiry to “won”. Leads from your forms flow in from a Google Sheet automatically." },
  { icon: Wallet, title: "Expenses and profit", description: "Income, expenses and profit by month, project and client – no more spreadsheet at month-end." },
  { icon: UsersRound, title: "Team with roles", description: "Members see only their own projects. Budgets, invoices and profit stay with owners and admins." },
  { icon: Palette, title: "Your brand everywhere", description: "Your logo and colour on every invoice, contract and client page, so you look like a bigger agency." },
];

const SPOTLIGHTS: { eyebrow: string; title: string; text: string; points: string[]; mock: ReactNode }[] = [
  {
    eyebrow: "Invoices",
    title: "Send the invoice on WhatsApp. Get paid by UPI.",
    text: "Make a professional, GST-ready invoice in about a minute and send it where your clients already are.",
    points: ["CGST + SGST or IGST split worked out for you", "UPI QR code with the exact amount due", "See when it's opened; record part or full payments"],
    mock: <InvoiceMock />,
  },
  {
    eyebrow: "Contracts",
    title: "Get the contract signed before the work starts.",
    text: "Start from your template – client name, project, amount and dates fill themselves in. Your client signs from their phone.",
    points: ["Clients sign by drawing or typing – no account needed", "You counter-sign and both get a signed copy", "Name, time, IP address and a fingerprint of the text are recorded"],
    mock: <ContractMock />,
  },
  {
    eyebrow: "Client portal",
    title: "Stop answering “any update?” on WhatsApp.",
    text: "Give each client one link that always shows where their project stands – and looks like your own brand.",
    points: ["Live progress and milestones", "Their invoices, contract and shared files in one place", "Never shows your costs, profit, tasks or internal notes"],
    mock: <PortalMock />,
  },
];

const AUDIENCE: { icon: LucideIcon; label: string }[] = [
  { icon: Megaphone, label: "Digital marketing agencies" },
  { icon: PenTool, label: "Design and branding studios" },
  { icon: Code2, label: "Web and app developers" },
  { icon: Clapperboard, label: "Video and content creators" },
  { icon: Share2, label: "Social media managers" },
  { icon: Briefcase, label: "Consultants and freelancers" },
];

const STEPS = [
  { title: "Sign in with Google", text: "No passwords, no card. Add your agency name, logo and GST details – it takes about a minute." },
  { title: "Add a client and a project", text: "Break the work into milestones, invite your team and attach files." },
  { title: "Send, sign, get paid", text: "Share the contract, the invoice and the client link. Watch payments and progress come in." },
];

interface Faq {
  q: string;
  a: ReactNode;
}

/** Common questions, grouped. Prices are shown in the visitor's currency. */
function faqs(currency: BillingCurrency): { group: string; items: Faq[] }[] {
  const india = currency === "INR";
  const growth = formatPlanPrice(PLANS.growth.price[currency].monthly, currency);
  return [
    {
      group: "Getting started",
      items: [
        {
          q: "Who is GrowUpliftOS for?",
          a: "For anyone who does client work and sends invoices: digital marketing and social media agencies, design studios, web developers, video editors, consultants and freelancers. If your week is a mix of WhatsApp chats, Excel sheets and Word files, it's built for you.",
        },
        {
          q: "How long does it take to set up?",
          a: "About a minute to sign in and add your agency details, and a few more minutes to add your first client, project and invoice. There is no training or setup call – if you can use WhatsApp, you can use GrowUpliftOS.",
        },
        {
          q: "Do my clients need to create an account or install an app?",
          a: "No. Clients get a private link to view an invoice, sign a contract or follow their project. It opens on any phone or laptop – nothing to install, nothing to remember.",
        },
        {
          q: "Does it work on my phone?",
          a: "Yes. GrowUpliftOS runs in the browser on your phone, tablet or laptop, so there is nothing to download. Your clients can sign contracts and pay invoices from their phones too.",
        },
      ],
    },
    {
      group: "Plans and payments",
      items: [
        {
          q: "Is it really free?",
          a: `Yes. When you sign in you get ${TRIAL_DAYS} days of Premium with everything unlocked, and no card is needed. After that you move to the Free plan on your own and can stay on it for as long as you like – projects, clients, invoices and a small CRM for one person. Team members, contracts, the client portal, finance and Google Sheet sync are on the paid plans, from ${growth} a month.`,
        },
        {
          q: `What happens when the ${TRIAL_DAYS}-day trial ends?`,
          a: "Nothing is charged unless you chose a plan. Your workspace simply moves to the Free plan, and nothing you made is deleted. Upgrade any time and everything is unlocked again straight away.",
        },
        {
          q: "Is the price per user?",
          a: "No. It's one flat price per workspace. Growth includes up to 5 people and Premium has no limit, so adding a team member never adds to your bill.",
        },
        {
          q: "How do I pay?",
          a: india
            ? "Monthly plans use auto-pay: you approve UPI AutoPay or a card once on Razorpay's secure page, and the plan renews each month. A yearly plan is a single payment by UPI, card or netbanking, with nothing taken automatically. You can also pay month by month without auto-pay."
            : "Monthly plans renew automatically by card on Dodo Payments' secure checkout. A yearly plan is a single payment with nothing taken automatically. Prices are in US dollars, and any sales tax or VAT is already included.",
        },
        {
          q: "Can I cancel any time? What about refunds?",
          a: `Yes – turn off auto-pay from Billing${india ? ", or from your UPI app or bank" : ""}, in two clicks. Nothing more is charged and your plan stays active until the end of the period you paid for. Because you can try everything free first, a period that has started isn't refunded – but if you are ever charged twice or by mistake, tell us within 7 days and we refund the extra.`,
        },
      ],
    },
    {
      group: "Features",
      items: [
        {
          q: "Does it make GST invoices?",
          a: "Yes. Add your GSTIN and choose CGST + SGST or IGST – the split is worked out and printed on the invoice, with a UPI QR code for the amount due. You can record part payments, and invoices in other currencies work too for clients abroad.",
        },
        {
          q: "Are the e-signatures legally valid?",
          a: "Electronic signatures are widely accepted for ordinary business agreements such as service contracts. Each signature is saved with the signer's name, the time, their IP address and device, and a fingerprint of the exact text they agreed to. For special documents (like property deeds), check what the law requires.",
        },
        {
          q: "Can I use my own logo and brand?",
          a: "Yes. Your logo and brand colour appear on your invoices, contracts and every client portal, so clients see your agency – not ours.",
        },
        {
          q: "What can my team members see?",
          a: "Members see only the projects they are assigned to. Budgets, invoices, expenses, profit, contracts and client contact details stay visible to owners and admins only.",
        },
      ],
    },
    {
      group: "Data and support",
      items: [
        {
          q: "Is my data safe?",
          a: "Every agency's data is kept separate, connections are encrypted, files are stored privately, and sign-in is handled by Google – we never see or store a password.",
        },
        {
          q: "What happens to my data if I stop paying?",
          a: "Nothing is deleted. Your workspace moves to the Free plan, invoices and contracts you already shared keep working, and everything comes back the moment you upgrade.",
        },
        {
          q: "How do I get help?",
          a: (
            <>
              Message us on{" "}
              <a href={whatsappSupportUrl()} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">
                WhatsApp ({SUPPORT_WHATSAPP_DISPLAY})
              </a>{" "}
              – you'll talk to the people who build GrowUpliftOS.
            </>
          ),
        },
      ],
    },
  ];
}

/** The main sign-up button: Google sign-in for visitors, the dashboard for people already signed in. */
function GetStarted({ signedIn, size = "lg", className }: { signedIn: boolean; size?: "lg" | "default"; className?: string }) {
  return signedIn ? (
    <Button asChild size={size} className={className}>
      <Link to="/app">
        Open dashboard <ArrowRight />
      </Link>
    </Button>
  ) : (
    <Button asChild size={size} className={cn("shadow-lift", className)}>
      <a href="/api/auth/google">
        <span className="flex size-5 items-center justify-center rounded-full bg-white">
          <GoogleIcon className="size-3.5" />
        </span>
        Start free with Google <ArrowRight />
      </a>
    </Button>
  );
}

function CheckLine({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <Check className="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} /> {children}
    </span>
  );
}

/** On phones, a "Start free" bar stays at the bottom once the hero's button has scrolled away. */
function MobileStickyCta({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 px-4 pt-3 pr-24 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-transform duration-300 md:hidden",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <Button asChild className="w-full" tabIndex={visible ? 0 : -1}>
        <a href="/api/auth/google">
          Start free – no card <ArrowRight />
        </a>
      </Button>
    </div>
  );
}

/** Public home page: what GrowUpliftOS does, who it's for, how it works, pricing and common questions. */
export default function LandingPage() {
  const { data: me } = useMe();
  const signedIn = Boolean(me);
  const currency = useDisplayCurrency();
  const fromPrice = formatPlanPrice(PLANS.growth.price[currency].monthly, currency);
  const groups = faqs(currency);

  // The sticky phone bar appears once the hero's own button is out of sight.
  const heroCta = useRef<HTMLDivElement>(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  useEffect(() => {
    const target = heroCta.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHeroCtaVisible(entry?.isIntersecting ?? true));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-background">
      <InAppBrowserNotice />
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
            {signedIn ? (
              <Button asChild size="sm">
                <Link to="/app">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <a href="/api/auth/google">Start free</a>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
          <motion.div variants={container} initial="hidden" animate="show" className="mx-auto max-w-3xl pt-12 text-center sm:pt-20">
            <motion.p variants={fadeUp} className="mx-auto flex w-fit items-center gap-2 rounded-full border bg-card/70 px-3.5 py-1 text-[13px] font-medium text-muted-foreground shadow-soft backdrop-blur">
              <Sparkles className="size-3.5 text-primary" /> Made in India for agencies and freelancers
            </motion.p>
            <motion.h1 variants={fadeUp} className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Run your agency from one place – and <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">get paid faster</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-2xl text-base text-balance text-muted-foreground sm:text-lg">
              Projects, GST invoices with UPI, e-signed contracts and a client portal in one simple app. Stop juggling WhatsApp, Excel and Word to keep clients happy.
            </motion.p>
            <motion.div variants={fadeUp} ref={heroCta} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <GetStarted signedIn={signedIn} className="w-full sm:w-auto" />
              <Button asChild size="lg" variant="outline" className="w-full bg-card sm:w-auto">
                <a href={DEMO_VIDEO_ID ? "#video" : "#how-it-works"}>
                  {DEMO_VIDEO_ID ? <PlayCircle /> : null} {DEMO_VIDEO_ID ? "Watch the demo" : "See how it works"}
                </a>
              </Button>
            </motion.div>
            <motion.p variants={fadeUp} className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
              <CheckLine>Free plan forever</CheckLine>
              <CheckLine>{TRIAL_DAYS} days of Premium free</CheckLine>
              <CheckLine>No card needed</CheckLine>
              <CheckLine>Paid plans from {fromPrice}/month</CheckLine>
            </motion.p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }} className="mt-14 sm:mt-20">
            <DashboardMock />
          </motion.div>
        </section>

        {/* What makes it fit */}
        <section aria-label="Highlights" className="border-y bg-card/60">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-5 px-5 py-7 text-sm sm:px-8 lg:grid-cols-4">
            {(
              [
                [BadgeIndianRupee, "GST-ready invoices", "CGST, SGST and IGST"],
                [MessageCircle, "WhatsApp and UPI built in", "Share and get paid faster"],
                [ShieldCheck, "E-sign with audit trail", "Name, time, IP recorded"],
                [Lock, "Private and secure", "Encrypted, Google sign-in"],
              ] as const
            ).map(([Icon, title, text]) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-[18px]" />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-[13px] text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Walkthrough video (shown once a video id is set) */}
        {DEMO_VIDEO_ID && (
          <section id="video" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-20 sm:px-8 sm:pt-28">
            <SectionHeading eyebrow="Watch first" title="Why I built this, and who it's for" text="A few minutes on the problem, and a walk through the whole thing with a real client from first enquiry to final payment." />
            <Reveal className="mt-10">
              <DemoVideo />
            </Reveal>
          </section>
        )}

        {/* Problem → solution */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <SectionHeading eyebrow="Sound familiar?" title="Client work is great. The admin around it isn't." text="Most agencies run on WhatsApp chats, Excel sheets and Word files. It works – until a payment slips, a contract never comes back, or a client asks for the fifth update this week." />
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <Reveal className="h-full">
              <div className="h-full rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">Without GrowUpliftOS</p>
                <ul className="mt-5 space-y-3.5">
                  {BEFORE.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[15px] text-muted-foreground">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        <X className="size-3" strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.08} className="h-full">
              <div className="h-full rounded-2xl border-2 border-primary/40 bg-card p-6 shadow-lift sm:p-8">
                <p className="text-sm font-semibold text-primary">With GrowUpliftOS</p>
                <ul className="mt-5 space-y-3.5">
                  {AFTER.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[15px]">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y bg-muted/30 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHeading eyebrow="Everything in one place" title="Replace five apps and a pile of spreadsheets" text="From the first enquiry to the final payment, every part of client work lives in one tidy workspace." />
            <motion.ul variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Features">
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

        {/* Who it's for */}
        <section className="border-y bg-muted/30 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHeading eyebrow="Who it's for" title="Made for people who do client work" text="Solo freelancer or a growing team of ten – if you send proposals, deliver projects and raise invoices, GrowUpliftOS fits." />
            <motion.ul variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" aria-label="Who it's for">
              {AUDIENCE.map((item) => (
                <motion.li key={item.label} variants={fadeUp} className="flex h-full items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="size-5" />
                  </span>
                  <span className="text-sm font-medium sm:text-[15px]">{item.label}</span>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <SectionHeading eyebrow="How it works" title="Up and running today, not next month" text="No training, no setup call, no implementation project. If you can use WhatsApp, you can use GrowUpliftOS." />
          <motion.ol variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <motion.li key={step.title} variants={fadeUp} className="h-full rounded-2xl border bg-card p-6 shadow-soft">
                <span className="tabular flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</span>
                <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
              </motion.li>
            ))}
          </motion.ol>
          <Reveal className="mt-10 flex flex-col items-center gap-3">
            <GetStarted signedIn={signedIn} />
            {!signedIn && <p className="text-[13px] text-muted-foreground">Takes about a minute · no card needed</p>}
          </Reveal>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 border-t bg-muted/30 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHeading eyebrow="Pricing" title="Simple pricing. One flat price for your whole team." text={`Try everything free for ${TRIAL_DAYS} days, then stay on Free or pick a plan. No per-user fees, no setup charges, cancel any time.`} />
            <Pricing signedIn={signedIn} />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
            <Reveal className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-sm font-semibold text-primary">FAQ</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Questions, answered</h2>
              <p className="mt-4 text-base text-muted-foreground">Everything people usually ask before they start. Can't find yours?</p>
              <div className="mt-6 rounded-2xl border bg-card p-5 shadow-soft">
                <p className="flex items-center gap-2 font-semibold">
                  <WhatsAppIcon className="size-5 text-[#25D366]" /> Talk to us on WhatsApp
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">Ask anything about plans, features or switching over – you'll hear back from the team that builds it.</p>
                <Button asChild variant="outline" className="mt-4 w-full">
                  <a href={whatsappSupportUrl("Hi, I have a question about GrowUpliftOS.")} target="_blank" rel="noopener noreferrer">
                    Chat on WhatsApp <ArrowRight />
                  </a>
                </Button>
              </div>
            </Reveal>
            <div className="space-y-10">
              {groups.map((group, groupIndex) => (
                <Reveal key={group.group}>
                  <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{group.group}</h3>
                  <div className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
                    {group.items.map((item, index) => (
                      <details key={item.q} className="group" open={groupIndex === 0 && index === 0}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium transition-colors hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
                          {item.q}
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:bg-primary/10 group-open:text-primary">
                            <Plus className="size-4" />
                          </span>
                        </summary>
                        <div className="px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground">{item.a}</div>
                      </details>
                    ))}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8 sm:pb-28">
          <Reveal className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-14 text-center text-white shadow-lift sm:px-12 sm:py-20">
            <div aria-hidden="true" className="absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Spend your time on client work, not on admin</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">Your first project, invoice and contract are a few minutes away. Start free – you can upgrade whenever you're ready.</p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {signedIn ? (
                <Button asChild size="lg" variant="secondary">
                  <Link to="/app">
                    Open dashboard <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="secondary" className="shadow-lift">
                  <a href="/api/auth/google">
                    <GoogleIcon /> Start free with Google <ArrowRight />
                  </a>
                </Button>
              )}
              <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
                <a href={whatsappSupportUrl()} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4" /> Questions? Chat with us
                </a>
              </Button>
            </div>
            <p className="relative mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-white/80">
              <span>✓ Free plan forever</span>
              <span>✓ {TRIAL_DAYS} days of Premium free</span>
              <span>✓ No card needed</span>
            </p>
          </Reveal>
        </section>
      </main>

      <footer className="relative border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 pb-24 text-[13px] text-muted-foreground sm:flex-row sm:px-8 md:pb-6">
          <span>© {new Date().getFullYear()} GrowUpliftOS · Made in India</span>
          <span className="flex flex-wrap justify-center gap-x-5 gap-y-2">
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
            <a href={whatsappSupportUrl()} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              WhatsApp {SUPPORT_WHATSAPP_DISPLAY}
            </a>
          </span>
        </div>
      </footer>
      {!signedIn && <MobileStickyCta visible={!heroCtaVisible} />}
      <WhatsAppSupportButton />
    </div>
  );
}
