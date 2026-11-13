import { Building2, CalendarClock } from "lucide-react";
import type { LeadDTO, MemberSummary } from "@shared/types";
import { MemberAvatar } from "@/features/members/member-avatar";
import { formatMoneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { followUpLabel } from "./meta";

interface LeadCardBodyProps {
  lead: LeadDTO;
  assignee: MemberSummary | undefined;
  currency: string;
  today: string;
}

/** What a lead shows on the board: who, where from, the next follow-up and (for managers) the deal value. */
export function LeadCardBody({ lead, assignee, currency, today }: LeadCardBodyProps) {
  const open = lead.stage !== "won" && lead.stage !== "lost";
  const followUp = lead.followUpDate && open ? followUpLabel(lead.followUpDate, today) : null;
  return (
    <>
      <p className="font-medium break-words">{lead.name}</p>
      {lead.company && (
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Building2 className="size-3.5 shrink-0" /> <span className="truncate">{lead.company}</span>
        </p>
      )}
      {followUp && (
        <p className={cn("mt-2 flex items-center gap-1.5 text-xs font-medium", followUp.tone === "overdue" ? "text-destructive" : followUp.tone === "today" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
          <CalendarClock className="size-3.5 shrink-0" /> {followUp.text}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{lead.sourceLabel ?? ""}</span>
        <span className="flex shrink-0 items-center gap-2">
          {lead.value !== null && lead.value > 0 && <span className="tabular text-xs font-semibold">{formatMoneyCompact(lead.value, currency)}</span>}
          {assignee && <MemberAvatar member={assignee} className="size-5" />}
        </span>
      </div>
    </>
  );
}
