import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { CalendarClock, Columns3, Download, FileSearch, FileSpreadsheet, List, Lock, Plus, Search, UserRoundSearch } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { LEAD_STAGES, type LeadStage } from "@shared/constants";
import type { LeadDTO } from "@shared/types";
import { formatIndianDate } from "@shared/dates";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { CountUp } from "@/components/shared/count-up";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { useLeadSources, useLeads, useSyncSheet, useUpdateLead } from "@/features/crm/api";
import { LeadBoard } from "@/features/crm/lead-board";
import { LeadFormDialog } from "@/features/crm/lead-form-dialog";
import { LeadPanel } from "@/features/crm/lead-panel";
import { OPEN_STAGES, STAGE_META, followUpLabel, syncMessage } from "@/features/crm/meta";
import { useIsLocked } from "@/features/billing/locked";
import { SheetsDialog } from "@/features/crm/sheets-dialog";
import { useMemberMap } from "@/features/members/api";
import { MemberAvatar } from "@/features/members/member-avatar";
import { errorMessage } from "@/lib/api";
import { celebrate } from "@/lib/confetti";
import { downloadCsv } from "@/lib/csv";
import { formatMoney, formatMoneyCompact, todayIso } from "@/lib/format";
import { cn, staggerIndex } from "@/lib/utils";

const ALL = "__all__";
const VIEW_KEY = "aos-crm-view";
/** A connected sheet is refreshed when the CRM is opened, unless it was synced this recently. */
const AUTO_SYNC_AFTER_MS = 10 * 60 * 1000;

type View = "board" | "list";
const shortDate = (ms: number) => formatIndianDate(new Date(ms), { day: "numeric", month: "short", year: "numeric" });

/** YYYY-MM-DD in the person's own time zone (an early-morning lead must not be exported under yesterday's date). */
function localDay(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

/** Pulls new rows from every connected sheet when the page opens, quietly unless something new arrived. */
function useAutoSync(enabled: boolean) {
  const { data: sources } = useLeadSources(enabled);
  const { mutateAsync } = useSyncSheet();
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || !sources || started.current) return;
    started.current = true;
    const due = sources.filter((source) => source.lastSyncedAt === null || Date.now() - source.lastSyncedAt > AUTO_SYNC_AFTER_MS);
    void (async () => {
      for (const source of due) {
        try {
          const result = await mutateAsync(source.id);
          if (result.added > 0) toast.success(syncMessage(source.name, result.added));
        } catch {
          // The problem is saved on the sheet and shown in the Google Sheets dialog; no need to interrupt here.
        }
      }
    })();
  }, [enabled, sources, mutateAsync]);

  return sources;
}

export default function CrmPage() {
  const { workspace, canManage } = useSession();
  const { data: leads, isPending, isError, refetch } = useLeads();
  const members = useMemberMap();
  const update = useUpdateLead();
  const sources = useAutoSync(canManage);
  const [searchParams, setSearchParams] = useSearchParams();
  const openLeadId = searchParams.get("lead") ?? "";
  const [view, setView] = useState<View>(readView);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<LeadStage | typeof ALL>(ALL);
  const [source, setSource] = useState(ALL);
  const [dueOnly, setDueOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const today = todayIso();
  const formatAmount = useCallback((value: number) => formatMoneyCompact(value, workspace.currency), [workspace.currency]);
  const formatCount = useCallback((value: number) => String(Math.round(value)), []);

  const openLead = (id: string) => setSearchParams(id ? { lead: id } : {}, { replace: true });
  const chooseView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* private browsing – the choice just isn't remembered */
    }
  };
  const isDue = useCallback((lead: LeadDTO) => lead.followUpDate !== null && lead.followUpDate <= today && OPEN_STAGES.includes(lead.stage), [today]);

  const summary = useMemo(() => {
    const all = leads ?? [];
    const open = all.filter((lead) => OPEN_STAGES.includes(lead.stage));
    const won = all.filter((lead) => lead.stage === "won");
    const closed = won.length + all.filter((lead) => lead.stage === "lost").length;
    return {
      open: open.length,
      pipeline: open.reduce((sum, lead) => sum + (lead.value ?? 0), 0),
      due: all.filter(isDue).length,
      won: won.length,
      wonValue: won.reduce((sum, lead) => sum + (lead.value ?? 0), 0),
      winRate: closed === 0 ? null : Math.round((won.length / closed) * 100),
    };
  }, [leads, isDue]);

  const sourceOptions = useMemo(() => [...new Set((leads ?? []).map((lead) => lead.sourceLabel).filter((label): label is string => Boolean(label)))].sort(), [leads]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? []).filter(
      (lead) =>
        (q === "" || `${lead.name} ${lead.company ?? ""} ${lead.email ?? ""} ${lead.phone ?? ""}`.toLowerCase().includes(q)) &&
        (source === ALL || lead.sourceLabel === source) &&
        // The board already separates stages into columns, so the stage filter only applies to the list.
        (view === "board" || stage === ALL || lead.stage === stage) &&
        (!dueOnly || isDue(lead)),
    );
  }, [leads, query, source, stage, view, dueOnly, isDue]);

  const move = (id: string, next: LeadStage) =>
    update.mutate(
      { id, input: { stage: next } },
      {
        onSuccess: () => {
          if (next === "won") void celebrate();
        },
        onError: (error) => toast.error(errorMessage(error, "Could not move the lead.")),
      },
    );

  const exportCsv = () =>
    downloadCsv(
      `leads_${today}.csv`,
      ["Name", "Company", "Phone", "Email", "Stage", "Source", "Assigned to", "Follow up on", ...(canManage ? [`Expected value (${workspace.currency})`] : []), "Added"],
      visible.map((lead) => [
        lead.name,
        lead.company,
        lead.phone,
        lead.email,
        STAGE_META[lead.stage].label,
        lead.sourceLabel,
        lead.assigneeId ? (members.get(lead.assigneeId)?.name ?? "") : "",
        lead.followUpDate,
        ...(canManage ? [lead.value === null ? null : lead.value / 100] : []),
        localDay(lead.createdAt),
      ]),
    );

  const addButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus /> Add lead
    </Button>
  );
  const sheetsLocked = useIsLocked("sheets");
  const sheetsButton = canManage && sheetsLocked ? (
    <Button asChild variant="outline" title="Google Sheet sync is on Growth and Premium">
      <Link to="/app/billing">
        <Lock /> Google Sheets
      </Link>
    </Button>
  ) : canManage && (
    <Button variant="outline" onClick={() => setSheetsOpen(true)}>
      <FileSpreadsheet /> Google Sheets
      {sources && sources.length > 0 && <span className="tabular rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{sources.length}</span>}
    </Button>
  );

  const tiles = [
    { label: "Open leads", value: summary.open, format: formatCount, hint: canManage && summary.pipeline > 0 ? `${formatMoney(summary.pipeline, workspace.currency)} in the pipeline` : "Being worked on" },
    { label: "Follow-ups due", value: summary.due, format: formatCount, hint: summary.due > 0 ? "Today or overdue" : "You're all caught up", tone: summary.due > 0 ? "text-amber-600 dark:text-amber-400" : undefined },
    canManage && summary.wonValue > 0
      ? { label: "Won", value: summary.wonValue, format: formatAmount, hint: `${summary.won} lead${summary.won === 1 ? "" : "s"} won`, tone: "text-success" }
      : { label: "Won", value: summary.won, format: formatCount, hint: "Leads turned into work", tone: "text-success" },
    { label: "Win rate", value: summary.winRate ?? 0, format: (value: number) => (summary.winRate === null ? "—" : `${Math.round(value)}%`), hint: "Won out of won + lost" },
  ];

  return (
    <>
      <PageHeader
        title="CRM"
        description={canManage ? "Every enquiry in one pipeline, from first message to signed client." : "The leads assigned to you."}
        actions={
          <>
            {sheetsButton}
            {addButton}
          </>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <div role="status" aria-label="Loading leads">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="mt-6 h-96 rounded-2xl" />
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title={canManage ? "No leads yet" : "No leads assigned to you yet"}
          description={canManage ? "Connect the Google Sheet your enquiries land in, or add your first lead by hand. Then track every follow-up until it's won." : "When a lead is assigned to you it will show up here. You can also add one yourself."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {canManage && (
                <Button onClick={() => setSheetsOpen(true)}>
                  <FileSpreadsheet /> Connect a Google Sheet
                </Button>
              )}
              <Button variant={canManage ? "outline" : "default"} onClick={() => setCreateOpen(true)}>
                <Plus /> Add a lead
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {tiles.map((tile, index) => (
              <motion.div key={tile.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }} className="rounded-2xl border bg-card p-5 shadow-soft">
                <dt className="text-sm text-muted-foreground">{tile.label}</dt>
                <dd className={cn("tabular mt-1.5 text-2xl font-semibold tracking-tight", tile.tone)}>
                  <CountUp value={tile.value} format={tile.format} />
                </dd>
                <dd className="mt-1 truncate text-xs text-muted-foreground">{tile.hint}</dd>
              </motion.div>
            ))}
          </dl>

          <div className="mt-6 mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <SegmentedControl
              label="View"
              value={view}
              onChange={chooseView}
              options={[
                { value: "board", label: "Board", icon: Columns3 },
                { value: "list", label: "List", icon: List },
              ]}
            />
            <div className="relative lg:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email…" aria-label="Search leads" className="h-9 pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <button
                type="button"
                onClick={() => setDueOnly((current) => !current)}
                aria-pressed={dueOnly}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium shadow-soft transition-colors",
                  dueOnly ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarClock className="size-3.5" /> Follow-ups due
                {summary.due > 0 && <span className="tabular">{summary.due}</span>}
              </button>
              {view === "list" && (
                <Select value={stage} onValueChange={(value) => setStage(value as LeadStage | typeof ALL)}>
                  <SelectTrigger className="h-9 w-40" aria-label="Stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All stages</SelectItem>
                    {LEAD_STAGES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {STAGE_META[option].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {sourceOptions.length > 1 && (
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="h-9 w-44" aria-label="Source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sources</SelectItem>
                    {sourceOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={visible.length === 0}>
                <Download /> Export
              </Button>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={FileSearch} title="No leads match" description="Try another search or clear the filters." className="py-12" />
          ) : view === "board" ? (
            <LeadBoard leads={visible} members={members} currency={workspace.currency} today={today} showValue={canManage} onOpen={openLead} onMove={move} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <caption className="sr-only">Leads</caption>
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Lead
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Stage
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Follow-up
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Source
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Owner
                    </th>
                    {canManage && (
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        Value
                      </th>
                    )}
                    <th scope="col" className="px-4 py-3 font-medium">
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((lead, index) => {
                    const assignee = lead.assigneeId ? members.get(lead.assigneeId) : undefined;
                    const followUp = lead.followUpDate && OPEN_STAGES.includes(lead.stage) ? followUpLabel(lead.followUpDate, today) : null;
                    return (
                      <tr key={lead.id} className="rise-in transition-colors hover:bg-accent/40" style={staggerIndex(index)}>
                        <th scope="row" className="max-w-64 px-4 py-3 font-normal">
                          <button type="button" onClick={() => openLead(lead.id)} className="block w-full rounded-sm text-left">
                            <span className="block truncate font-medium hover:text-primary">{lead.name}</span>
                            <span className="block truncate text-[13px] text-muted-foreground">{[lead.company, lead.phone ?? lead.email].filter(Boolean).join(" · ") || "No contact details"}</span>
                          </button>
                        </th>
                        <td className="px-4 py-3">
                          <Select value={lead.stage} onValueChange={(value) => move(lead.id, value as LeadStage)}>
                            {/* sm:text-xs because the trigger switches to sm:text-sm from that size up. */}
                            <SelectTrigger className={cn("h-7 w-fit gap-1.5 rounded-full border-0 px-2.5 text-xs font-medium shadow-none sm:text-xs", STAGE_META[lead.stage].badge)} aria-label={`Stage of ${lead.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STAGES.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {STAGE_META[option].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className={cn("px-4 py-3 text-[13px] whitespace-nowrap", followUp?.tone === "overdue" ? "font-medium text-destructive" : followUp?.tone === "today" ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                          {followUp ? followUp.text.replace(/^Follow[- ]up /i, "").replace(/^was due /, "") : "—"}
                        </td>
                        <td className="max-w-40 truncate px-4 py-3 text-[13px] text-muted-foreground">{lead.sourceLabel ?? "—"}</td>
                        <td className="px-4 py-3">
                          {assignee ? (
                            <span className="flex items-center gap-2 text-[13px]">
                              <MemberAvatar member={assignee} className="size-5" /> <span className="truncate">{assignee.name}</span>
                            </span>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">Unassigned</span>
                          )}
                        </td>
                        {canManage && <td className="tabular px-4 py-3 text-right font-medium whitespace-nowrap">{lead.value !== null && lead.value > 0 ? formatMoney(lead.value, workspace.currency) : <span className="font-normal text-muted-foreground">—</span>}</td>}
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap text-muted-foreground">{shortDate(lead.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <LeadPanel leadId={openLeadId} onClose={() => openLead("")} />
      <LeadFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(lead) => openLead(lead.id)} />
      {canManage && <SheetsDialog open={sheetsOpen} onOpenChange={setSheetsOpen} />}
    </>
  );
}
