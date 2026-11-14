import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface ProgressProps {
  /** 0–100 */
  value: number;
  className?: string;
  /** Accessible name, e.g. "Project progress". */
  label?: string;
  /** What reaching 100% means: a goal met (default) or an allowance used up. */
  full?: "done" | "limit";
}

/** Progress bar whose fill animates to its value (and re-animates when the value changes). */
export function Progress({ value, className, label = "Progress", full = "done" }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <motion.div
        className={cn("h-full rounded-full", clamped < 100 ? "bg-primary" : full === "limit" ? "bg-amber-500" : "bg-success")}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
}
