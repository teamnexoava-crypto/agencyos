import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface WorkspaceLogoProps {
  name: string;
  logoUrl: string | null;
  className?: string;
}

/** The agency's logo, or a gradient tile with its initials when none is uploaded. */
export function WorkspaceLogo({ name, logoUrl, className }: WorkspaceLogoProps) {
  if (logoUrl) {
    return <img src={logoUrl} alt={`${name} logo`} className={cn("size-9 shrink-0 rounded-lg border bg-white object-contain", className)} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-[13px] font-semibold text-primary-foreground shadow-soft",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
