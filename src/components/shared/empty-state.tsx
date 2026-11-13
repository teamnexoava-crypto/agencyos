import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Primary call to action (usually a <Button>). */
  action?: ReactNode;
  className?: string;
}

/** Friendly placeholder for empty lists: soft illustrated icon, one sentence, one clear CTA. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-card/60 px-6 py-16 text-center",
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative mb-5">
        <div aria-hidden="true" className="absolute inset-0 scale-150 rounded-full bg-primary/15 blur-2xl" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl border bg-card shadow-lift">
          <Icon className="size-6 text-primary" />
        </div>
      </div>
      <h2 className="relative text-lg font-semibold tracking-tight">{title}</h2>
      <p className="relative mt-1.5 max-w-sm text-sm text-balance text-muted-foreground">{description}</p>
      {action && <div className="relative mt-6">{action}</div>}
    </motion.div>
  );
}
