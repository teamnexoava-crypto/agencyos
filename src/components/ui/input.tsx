import * as React from "react";
import { cn } from "@/lib/utils";

// 16px text on phones: iOS Safari zooms the page into any field whose font is smaller, and does not
// zoom back out. From `sm` up the denser 14px returns.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base shadow-soft transition-[border-color,box-shadow] duration-150 outline-none sm:text-sm",
        "placeholder:text-muted-foreground/70 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
