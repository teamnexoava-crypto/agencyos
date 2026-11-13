import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Building2, CalendarClock, LoaderCircle, Mail, MessageCircle, Pencil, Phone, Trash2, UserRoundCheck } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { LEAD_NOTE_KINDS, LEAD_STAGES, type LeadNoteKind, type LeadStage } from "@shared/constants";
import type { LeadDetail, MemberSummary } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/api";
import { useMembers } from "@/features/members/api";
import { MemberSelect } from "@/features/members/member-select";
import { ApiError, errorMessage } from "@/lib/api";
import { celebrate } from "@/lib/confetti";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { whatsappUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { useAddLeadNote, useConvertLead, useDeleteLead, useDeleteLeadNote, useLead, useUpdateLead } from "./api";
import { LeadFormDialog } from "./lead-form-dialog";
import { NOTE_META, STAGE_META, followUpLabel } from "./meta";

const formatInstant = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const WRITABLE_KINDS = LEAD_NOTE_KINDS.filter((kind): kind is Exclude<LeadNoteKind, "system"> => kind !== "system");
const NOTE_PLACEHOLDER: Record<Exclude<LeadNoteKind, "system">, string> = {
  note: "Anything worth remembering about this lead…",
  call: "What was said on the call?",
  message: "What did you send, or what did they reply?",
  meeting: "What was discussed and agreed?",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Notes({ lead }: { lead: LeadDetail }) {
  const add = useAddLeadNote(lead.id);
  const remove = useDeleteLeadNote(lead.id);
  const [kind, setKind] = useState<Exclude<LeadNoteKind, "system">>("note");
  const [body, setBody] = useState("");

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    add.mutate({ kind, body: text }, { onSuccess: () => setBody(""), onError: (error) => toast.error(errorMessage(error, "Could not save the note.")) });
  };

  return (
    <section aria-labelledby="lead-notes-heading">
      <h3 id="lead-notes-heading" className="text-sm font-semibold">
        Notes and activity
      </h3>
      <form
        className="mt-3 rounded-xl border bg-card shadow-soft focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div role="radiogroup" aria-label="What are you adding?" className="flex gap-1 border-b p-1.5">
          {WRITABLE_KINDS.map((option) => {
            const Icon = NOTE_META[option].icon;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={kind === option}
                onClick={() => setKind(option)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                  kind === option && "bg-accent text-accent-foreground",
                )}
              >
                <Icon className="size-3.5" /> {NOTE_META[option].label}
              </button>
            );
          })}
        </div>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
          }}
          rows={3}
          maxLength={4000}
          placeholder={NOTE_PLACEHOLDER[kind]}
          aria-label={`${NOTE_META[kind].label} text`}
          className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <p className="text-xs text-muted-foreground">{kind === "note" ? "Only your team sees this." : "Also updates “last contacted”."}</p>
          <Button type="submit" size="sm" disabled={add.isPending || body.trim() === ""}>
            {add.isPending && <LoaderCircle className="animate-spin" />} {kind === "note" ? "Add note" : `Log ${NOTE_META[kind].label.toLowerCase()}`}
          </Button>
        </div>
      </form>

      <ol className="mt-5 space-y-4">
        <AnimatePresence initial={false}>
          {lead.notes.map((note) => {
            const meta = NOTE_META[note.kind];
            const system = note.kind === "system";
            return (
              <motion.li key={note.id} layout="position" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="group flex gap-3">
                <span aria-hidden="true" className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", system ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                  <meta.icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  {system ? (
                    <p className="pt-1 text-[13px] text-muted-foreground">
                      {note.body}
                      {note.authorName && note.authorName !== "AgencyOS" && ` · ${note.authorName}`} · {formatInstant(note.createdAt)}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{note.authorName ?? "Someone"}</span> {meta.verb} · {formatInstant(note.createdAt)}
                      </p>
                      <p className="mt-1 rounded-xl rounded-tl-sm bg-muted/70 px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap">{note.body}</p>
                    </>
                  )}
                </div>
                {note.canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete this note"
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    onClick={() => remove.mutate(note.id, { onError: (error) => toast.error(errorMessage(error, "Could not delete the note.")) })}
                  >
                    <Trash2 />
                  </Button>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </section>
  );
}

function LeadBody({ lead, members, onClose }: { lead: LeadDetail; members: MemberSummary[]; onClose: () => void }) {
  const { workspace, canManage } = useSession();
  const update = useUpdateLead();
  const convert = useConvertLead(lead.id);
  const remove = useDeleteLead();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "convert" | null>(null);
  const today = todayIso();
  const followUp = lead.followUpDate ? followUpLabel(lead.followUpDate, today) : null;
  const open = lead.stage !== "won" && lead.stage !== "lost";
  const assignee = members.find((member) => member.id === lead.assigneeId);
  const extra = Object.entries(lead.extra);

  const patch = (input: Parameters<typeof update.mutate>[0]["input"], success?: string) =>
    update.mutate(
      { id: lead.id, input },
      {
        onSuccess: (saved) => {
          if (success) toast.success(success);
          if (input.stage === "won" && saved.stage === "won") void celebrate();
        },
        onError: (error) => toast.error(errorMessage(error, "Could not update the lead.")),
      },
    );

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="text-xl break-words">{lead.name}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {lead.company && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" /> {lead.company}
            </span>
          )}
          {lead.company && lead.sourceLabel && <span aria-hidden="true">·</span>}
          {lead.sourceLabel && <span>From {lead.sourceLabel}</span>}
          {!lead.company && !lead.sourceLabel && <span>Lead</span>}
        </SheetDescription>
        <div className="mt-3 flex flex-wrap gap-2">
          {lead.phone && (
            <Button asChild size="sm" className="bg-[#25D366] text-white hover:bg-[#1fb957]">
              <a href={whatsappUrl(lead.phone)} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          {lead.phone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>
                <Phone /> Call
              </a>
            </Button>
          )}
          {lead.email && (
            <Button asChild size="sm" variant="outline">
              <a href={`mailto:${lead.email}`}>
                <Mail /> Email
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </Button>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-7 overflow-y-auto p-6">
        {followUp && open && (
          <p
            role="status"
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium",
              followUp.tone === "overdue" ? "border-rose-600/30 bg-rose-500/10 text-rose-800 dark:text-rose-300" : followUp.tone === "today" ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-muted/50",
            )}
          >
            <CalendarClock className="size-4 shrink-0" /> {followUp.text}
          </p>
        )}

        <dl>
          <Field label="Stage">
            <Select value={lead.stage} onValueChange={(stage) => patch({ stage: stage as LeadStage })}>
              <SelectTrigger className="h-9" aria-label="Stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    <span aria-hidden="true" className={cn("size-2 rounded-full", STAGE_META[stage].dot)} /> {STAGE_META[stage].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Follow up on">
            <Input type="date" className="h-9" aria-label="Follow up on" value={lead.followUpDate ?? ""} onChange={(event) => patch({ followUpDate: event.target.value })} />
          </Field>
          <Field label="Assigned to">
            {canManage ? (
              <MemberSelect members={members} value={lead.assigneeId ?? ""} onChange={(assigneeId) => patch({ assigneeId }, assigneeId ? "Lead assigned" : undefined)} className="h-9" aria-label="Assigned to" />
            ) : (
              <span>{assignee?.name ?? "Unassigned"}</span>
            )}
          </Field>
          {canManage && <Field label="Expected value">{lead.value !== null ? <span className="tabular font-medium">{formatMoney(lead.value, workspace.currency)}</span> : <span className="text-muted-foreground">Not set</span>}</Field>}
          {lead.phone && (
            <Field label="Phone">
              <span className="tabular break-all">{lead.phone}</span>
            </Field>
          )}
          {lead.email && (
            <Field label="Email">
              <span className="break-all">{lead.email}</span>
            </Field>
          )}
          <Field label="Last contacted">{lead.lastContactedAt ? formatInstant(lead.lastContactedAt) : <span className="text-muted-foreground">Not yet</span>}</Field>
          <Field label="Added">{formatDate(new Date(lead.createdAt).toISOString().slice(0, 10))}</Field>
        </dl>

        {extra.length > 0 && (
          <section aria-labelledby="lead-extra-heading">
            <h3 id="lead-extra-heading" className="text-sm font-semibold">
              From the sheet
            </h3>
            <dl className="mt-2 divide-y rounded-xl border bg-card text-sm">
              {extra.map(([label, value]) => (
                <div key={label} className="px-3.5 py-2.5">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 break-words whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {canManage && (
          <section className="rounded-xl border bg-card p-4">
            {lead.clientId ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <UserRoundCheck className="size-4 text-success" /> This lead is now a client
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/app/clients/${lead.clientId}`}>
                    Open client <ArrowUpRight />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Ready to start work?</p>
                  <p className="text-[13px] text-muted-foreground">Make them a client to create projects, contracts and invoices.</p>
                </div>
                <Button size="sm" onClick={() => setConfirm("convert")} disabled={convert.isPending}>
                  {convert.isPending ? <LoaderCircle className="animate-spin" /> : <UserRoundCheck />} Convert to client
                </Button>
              </div>
            )}
          </section>
        )}

        <Notes lead={lead} />

        {canManage && (
          <div className="border-t pt-5">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirm("delete")}>
              <Trash2 /> Delete lead
            </Button>
          </div>
        )}
      </div>

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <ConfirmDialog
        open={confirm === "convert"}
        onOpenChange={(next) => !next && setConfirm(null)}
        title={`Make ${lead.name} a client?`}
        description="A client is created with their name, company, email and phone, and this lead is marked as won. The lead and its notes stay here."
        confirmLabel="Convert to client"
        destructive={false}
        onConfirm={() => {
          setConfirm(null);
          convert.mutate(undefined, {
            onSuccess: () => {
              toast.success(`${lead.name} is now a client`);
              void celebrate();
            },
            onError: (error) => toast.error(errorMessage(error, "Could not convert the lead.")),
          });
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(next) => !next && setConfirm(null)}
        title={`Delete ${lead.name}?`}
        description="The lead and its notes are removed from the CRM. If it came from a Google Sheet, syncing won't bring it back."
        onConfirm={() => {
          setConfirm(null);
          remove.mutate(lead.id, {
            onSuccess: () => {
              toast.success("Lead deleted");
              onClose();
            },
            onError: (error) => toast.error(errorMessage(error, "Could not delete the lead.")),
          });
        }}
      />
    </>
  );
}

interface LeadPanelProps {
  /** "" → closed. */
  leadId: string;
  onClose: () => void;
}

/** Everything about one lead, in a side panel over the board: details, quick actions, and the notes timeline. */
export function LeadPanel({ leadId, onClose }: LeadPanelProps) {
  const { data: lead, isPending, error, refetch } = useLead(leadId);
  const { data: members = [] } = useMembers();
  const missing = error instanceof ApiError && error.status === 404;

  return (
    <Sheet open={leadId !== ""} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-w-xl gap-0 p-0">
        {leadId === "" ? null : error ? (
          <>
            <SheetHeader>
              <SheetTitle>{missing ? "Lead not found" : "Couldn't load this lead"}</SheetTitle>
              <SheetDescription>{missing ? "It may have been deleted, or it isn't assigned to you." : "Check your connection and try again."}</SheetDescription>
            </SheetHeader>
            {!missing && <ErrorState onRetry={() => void refetch()} />}
          </>
        ) : isPending || !lead ? (
          <div className="space-y-4 p-6" role="status" aria-label="Loading lead">
            <SheetTitle className="sr-only">Loading lead</SheetTitle>
            <SheetDescription className="sr-only">Please wait.</SheetDescription>
            <Skeleton className="h-8 w-2/3 rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : (
          <LeadBody key={lead.id} lead={lead} members={members} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
