import { motion, type Variants } from "motion/react";
import { ArrowRight, FileSignature, FolderKanban, Link2, ReceiptText, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { BrandLogo, GoogleIcon } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: FolderKanban, title: "Projects & milestones", description: "Kanban board, ordered steps, tasks and progress that updates itself." },
  { icon: ReceiptText, title: "GST-ready invoices", description: "Live preview, PDF, partial payments and one-tap sharing on WhatsApp." },
  { icon: FileSignature, title: "Contracts & e-sign", description: "Templates, a public signing page and a tamper-evident audit trail." },
  { icon: Wallet, title: "Profit & loss", description: "Income, expenses and profit by month, project and client." },
  { icon: Link2, title: "Client portal link", description: "One private link per project: progress, invoices, contract and files." },
  { icon: ShieldCheck, title: "Roles & privacy", description: "Members see only their projects. Finances stay with owners and admins." },
];

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } } };

/**
 * Public home page. Phase 1 ships the hero + feature grid; the full marketing page (how it works,
 * pricing, FAQ, scroll reveals) is built out in Phase 8.
 */
export default function LandingPage() {
  const { data: me } = useMe();
  const signedIn = Boolean(me);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[40rem] bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div aria-hidden="true" className="absolute -top-48 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label="AgencyOS home" className="rounded-lg">
          <BrandLogo />
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild variant={signedIn ? "default" : "ghost"} size="sm">
            <Link to={signedIn ? "/app" : "/login"}>{signedIn ? "Open dashboard" : "Sign in"}</Link>
          </Button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <motion.section variants={container} initial="hidden" animate="show" className="mx-auto max-w-3xl pt-14 text-center sm:pt-24">
          <motion.p variants={fadeUp} className="mx-auto w-fit rounded-full border bg-card/70 px-3.5 py-1 text-[13px] font-medium text-muted-foreground shadow-soft backdrop-blur">
            Built for agencies, freelancers & service providers
          </motion.p>
          <motion.h1 variants={fadeUp} className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Run your whole agency from{" "}
            <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">one place</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-xl text-base text-balance text-muted-foreground sm:text-lg">
            Projects, team, invoices, contracts and e-signatures — with a private link your clients will actually love.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {signedIn ? (
              <Button asChild size="lg">
                <Link to="/app">
                  Open dashboard <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="bg-card">
                <a href="/api/auth/google">
                  <GoogleIcon /> Continue with Google
                </a>
              </Button>
            )}
            <span className="text-[13px] text-muted-foreground">Free to start · No password needed</span>
          </motion.div>
        </motion.section>

        <motion.ul
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-20 grid gap-4 sm:mt-28 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Features"
        >
          {FEATURES.map((feature) => (
            <motion.li
              key={feature.title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              className="rounded-2xl border bg-card p-6 shadow-soft transition-shadow duration-200 hover:shadow-lift"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <feature.icon className="size-5" />
              </span>
              <h2 className="mt-4 font-semibold tracking-tight">{feature.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
            </motion.li>
          ))}
        </motion.ul>
      </main>

      <footer className="relative border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-[13px] text-muted-foreground sm:flex-row sm:px-8">
          <span>© {new Date().getFullYear()} AgencyOS</span>
          <span className="flex gap-5">
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
