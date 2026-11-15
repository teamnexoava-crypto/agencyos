import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { ContractListItem } from "@shared/types";
import { formatIndianDate } from "@shared/dates";
import { cn, staggerIndex } from "@/lib/utils";
import { ContractStatusBadge } from "./status-badge";

const shortDate = (ms: number) => formatIndianDate(new Date(ms), { day: "numeric", month: "short", year: "numeric" });

interface ContractRowsProps {
  contracts: ContractListItem[];
  hide?: ("client" | "project")[];
  className?: string;
}

/** Compact contract list used on the contracts page and inside a project. */
export function ContractRows({ contracts, hide = [], className }: ContractRowsProps) {
  return (
    <ul className={cn("divide-y overflow-hidden rounded-2xl border bg-card shadow-soft", className)}>
      {contracts.map((contract, index) => {
        const subtitle = [!hide.includes("client") && contract.clientName, !hide.includes("project") && contract.projectTitle].filter(Boolean).join(" · ");
        const when = contract.completedAt ? `Signed ${shortDate(contract.completedAt)}` : contract.sentAt ? `Sent ${shortDate(contract.sentAt)}` : `Edited ${shortDate(contract.updatedAt)}`;
        return (
          <li key={contract.id} className="rise-in" style={staggerIndex(index)}>
            <Link to={`/app/contracts/${contract.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/40">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="truncate font-medium">{contract.title}</span>
                  {contract.version > 1 && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">v{contract.version}</span>}
                  <ContractStatusBadge status={contract.status} />
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {subtitle && `${subtitle} · `}
                  {when}
                </p>
              </div>
              <ArrowUpRight className="hidden size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
