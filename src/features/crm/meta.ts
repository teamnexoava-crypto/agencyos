import { CalendarClock, MessageSquareText, Phone, StickyNote, Workflow, type LucideIcon } from "lucide-react";
import type { LeadNoteKind, LeadStage } from "@shared/constants";

export const STAGE_META: Record<LeadStage, { label: string; badge: string; dot: string }> = {
  new: { label: "New", badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  contacted: { label: "Contacted", badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  qualified: { label: "Qualified", badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
  proposal: { label: "Proposal sent", badge: "bg-amber-500/12 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  won: { label: "Won", badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  lost: { label: "Lost", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
};

export const NOTE_META: Record<LeadNoteKind, { label: string; verb: string; icon: LucideIcon }> = {
  note: { label: "Note", verb: "added a note", icon: StickyNote },
  call: { label: "Call", verb: "logged a call", icon: Phone },
  message: { label: "Message", verb: "logged a message", icon: MessageSquareText },
  meeting: { label: "Meeting", verb: "logged a meeting", icon: CalendarClock },
  system: { label: "Update", verb: "", icon: Workflow },
};

/** Stages where the deal is still being worked. */
export const OPEN_STAGES: LeadStage[] = ["new", "contacted", "qualified", "proposal"];

/** "Follow up today", "2 days overdue", "in 3 days" – with a tone for colouring. */
export function followUpLabel(iso: string, today: string): { text: string; tone: "overdue" | "today" | "later" } {
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: days === -1 ? "Follow-up was due yesterday" : `Follow-up ${-days} days overdue`, tone: "overdue" };
  if (days === 0) return { text: "Follow up today", tone: "today" };
  return { text: days === 1 ? "Follow up tomorrow" : `Follow up in ${days} days`, tone: "later" };
}

/** What a sync did, in one line for a toast. */
export function syncMessage(name: string, added: number): string {
  return added === 0 ? `${name}: no new leads` : `${added} new lead${added === 1 ? "" : "s"} from ${name}`;
}
