import { motion } from "motion/react";
import { CircleAlert, FlaskConical, LoaderCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { BrandMark, GoogleIcon } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuthConfig, useDevLogin } from "@/features/auth/api";
import { errorMessage } from "@/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled. Please try again.",
  invalid_state: "That sign-in link expired. Please try again.",
  unverified_email: "Your Google account's email address isn't verified yet.",
  google_failed: "We couldn't complete sign-in with Google. Please try again.",
  not_configured: "Google sign-in isn't configured on this server yet.",
  server_error: "Something went wrong on our side. Please try again.",
};

/** Only same-site paths are forwarded (the server re-validates this too). */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const { data: config } = useAuthConfig();
  const devLogin = useDevLogin();

  const errorCode = params.get("error");
  const error = errorCode ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.server_error) : null;
  const next = safeNext(params.get("next"));
  const googleHref = next ? `/api/auth/google?next=${encodeURIComponent(next)}` : "/api/auth/google";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div aria-hidden="true" className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div aria-hidden="true" className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          ← Back to home
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-sm rounded-2xl border bg-card/80 p-8 shadow-pop backdrop-blur-xl"
        >
          <div className="flex flex-col items-center text-center">
            <BrandMark className="size-12" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome to GrowUpliftOS</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Sign in or create your workspace in one click. No password needed.</p>
          </div>

          {error && (
            <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[13px] text-destructive">
              <CircleAlert className="mt-px size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <Button asChild variant="outline" size="lg" className="w-full">
              <a href={googleHref}>
                <GoogleIcon /> Continue with Google
              </a>
            </Button>

            {config?.devLogin && (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={devLogin.isPending}
                onClick={() => devLogin.mutate(undefined, { onError: (e) => toast.error(errorMessage(e, "Dev login failed.")) })}
              >
                {devLogin.isPending ? <LoaderCircle className="animate-spin" /> : <FlaskConical />}
                Continue as demo user
              </Button>
            )}
          </div>

          {config?.devLogin && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Demo login is a local-development shortcut{!config.googleConfigured && " (Google OAuth isn't configured in .dev.vars yet)"}.
            </p>
          )}

          <p className="mt-6 text-center text-xs text-balance text-muted-foreground">
            By continuing you agree to our{" "}
            <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </motion.div>
      </main>
    </div>
  );
}
