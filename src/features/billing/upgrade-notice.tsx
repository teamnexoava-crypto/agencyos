import { Lock } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/api";
import { cn } from "@/lib/utils";
import { LOCKED, useIsLocked, type LockedFeature } from "./locked";

/**
 * Shown where a feature would be when the plan does not include it. `banner` sits above content that
 * can still be read (e.g. contracts made during the trial); the default fills the page or tab.
 */
export function UpgradeNotice({ feature, banner = false, className }: { feature: LockedFeature; banner?: boolean; className?: string }) {
  const locked = useIsLocked(feature);
  const { canManage } = useSession();
  if (!locked) return null;
  const { title, text } = LOCKED[feature];
  return (
    <section
      aria-label={title}
      className={cn("rounded-2xl border bg-card shadow-soft", banner ? "mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center" : "mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-12 text-center", className)}
    >
      <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary", banner ? "size-10" : "size-12")}>
        <Lock className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className={cn("font-semibold tracking-tight", banner ? "text-sm" : "text-lg")}>{title}</h2>
        <p className={cn("text-muted-foreground", banner ? "text-[13px]" : "mt-1 text-sm")}>{text}</p>
      </div>
      {canManage && (
        <Button asChild size={banner ? "sm" : "default"} className="shrink-0">
          <Link to="/app/billing">See plans</Link>
        </Button>
      )}
    </section>
  );
}
