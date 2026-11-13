import type { ContractStatus } from "@shared/constants";
import { cn } from "@/lib/utils";
import { CONTRACT_STATUS_META } from "./meta";

export function ContractStatusBadge({ status, className }: { status: ContractStatus; className?: string }) {
  const meta = CONTRACT_STATUS_META[status];
  return (
    <span className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", meta.badge, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
