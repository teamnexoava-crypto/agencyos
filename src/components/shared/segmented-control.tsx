import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Small trailing element, e.g. a count. */
  badge?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group, e.g. "Filter invoices". */
  label: string;
  size?: "sm" | "md";
  /** Stretch to the container and give every option the same width. */
  fullWidth?: boolean;
  className?: string;
}

/**
 * A row of mutually exclusive choices (filters, view switches). The highlight is one shared element
 * that slides to the chosen option instead of blinking from one to the next.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, size = "md", fullWidth = false, className }: SegmentedControlProps<T>) {
  const id = useId();
  return (
    <div role="group" aria-label={label} className={cn("max-w-full overflow-x-auto rounded-lg border bg-card p-0.5 shadow-soft [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", fullWidth ? "grid auto-cols-fr grid-flow-col" : "flex w-fit", className)}>
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-200",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
              active ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && <motion.span layoutId={`segment-${id}`} aria-hidden="true" className="absolute inset-0 rounded-md bg-accent" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
            {Icon && <Icon className="relative size-3.5" />}
            <span className="relative">{option.label}</span>
            {option.badge !== undefined && option.badge !== null && <span className="relative">{option.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
