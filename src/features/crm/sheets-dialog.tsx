import { useState } from "react";
import { ArrowLeft, ArrowUpRight, CircleAlert, FileSpreadsheet, LoaderCircle, Plus, RefreshCw, Settings2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { LEAD_MAP_FIELDS, type LeadMapField } from "@shared/constants";
import type { LeadSourceDTO, SheetPreview } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useConnectSheet, useDisconnectSheet, useLeadSources, usePreviewSheet, useSyncSheet, useUpdateSheet } from "./api";
import { syncMessage } from "./meta";

const SKIP = "__skip__";
const FIELD_LABEL: Record<LeadMapField, { label: string; hint: string }> = {
  name: { label: "Name", hint: "Who the lead is" },
  phone: { label: "Phone / WhatsApp", hint: "Used for the WhatsApp and Call buttons" },
  email: { label: "Email", hint: "Used for the Email button" },
  company: { label: "Company", hint: "Their business name" },
};

type Mapping = Partial<Record<LeadMapField, string>>;

/* ------------------------------------------------------------------------------------------------
 * Step 2 (also used to edit a connected sheet): name it and say which column is which
 * ---------------------------------------------------------------------------------------------- */

interface MappingStepProps {
  preview: SheetPreview;
  initialName: string;
  initialMapping: Mapping;
  submitLabel: string;
  saving: boolean;
  onBack: () => void;
  onSubmit: (name: string, mapping: Mapping) => void;
}

function MappingStep({ preview, initialName, initialMapping, submitLabel, saving, onBack, onSubmit }: MappingStepProps) {
  const [name, setName] = useState(initialName);
  // A saved column that no longer exists in the sheet is dropped rather than shown as a broken choice.
  const [mapping, setMapping] = useState<Mapping>(() => Object.fromEntries(Object.entries(initialMapping).filter(([, header]) => header && preview.headers.includes(header))) as Mapping);
  const [showErrors, setShowErrors] = useState(false);
  const hasIdentity = Boolean(mapping.name || mapping.phone || mapping.email);
  const nameValid = name.trim().length > 0;

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasIdentity || !nameValid) return setShowErrors(true);
        onSubmit(name.trim(), mapping);
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="sheet-name">Name for this sheet</Label>
        <Input id="sheet-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="e.g. Website enquiry form" aria-invalid={showErrors && !nameValid} />
        {showErrors && !nameValid ? <p className="text-[13px] text-destructive">Name this sheet</p> : <p className="text-[13px] text-muted-foreground">Shown on each lead as where it came from.</p>}
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Which column is which?</legend>
        {LEAD_MAP_FIELDS.map((field) => (
          <div key={field} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <Label htmlFor={`map-${field}`} className="flex-col items-start gap-0">
              {FIELD_LABEL[field].label}
              <span className="text-xs font-normal text-muted-foreground">{FIELD_LABEL[field].hint}</span>
            </Label>
            <Select value={mapping[field] ?? SKIP} onValueChange={(value) => setMapping((current) => ({ ...current, [field]: value === SKIP ? undefined : value }))}>
              <SelectTrigger id={`map-${field}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SKIP}>
                  <span className="text-muted-foreground">Not in this sheet</span>
                </SelectItem>
                {preview.headers.map((header) => (
                  <SelectItem key={header} value={header}>
                    {header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {showErrors && !hasIdentity && <p className="text-[13px] text-destructive">Choose the column that holds the name, phone or email.</p>}
        <p className="text-[13px] text-muted-foreground">Every other column is kept too – you'll see it on the lead under “From the sheet”.</p>
      </fieldset>

      {preview.sampleRows.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            First rows of your sheet <span className="font-normal text-muted-foreground">· {preview.rowCount} in total</span>
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.sampleRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {preview.headers.map((header, index) => (
                      <td key={header} className="max-w-48 truncate px-3 py-2 whitespace-nowrap">
                        {row[index] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <LoaderCircle className="animate-spin" />} {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Step 1: paste the link
 * ---------------------------------------------------------------------------------------------- */

function LinkStep({ onBack, onPreview }: { onBack?: () => void; onPreview: (url: string, preview: SheetPreview) => void }) {
  const preview = usePreviewSheet();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const link = url.trim();
        if (!link) return setError("Paste the link to your Google Sheet");
        setError("");
        preview.mutate(link, { onSuccess: (data) => onPreview(link, data), onError: (err) => setError(errorMessage(err, "Could not read that sheet. Please try again.")) });
      }}
    >
      <ol className="grid gap-3 text-sm">
        {[
          ["Open your Google Sheet", "The first row should hold the column names – Name, Phone, Email and so on."],
          ["Click Share → General access → “Anyone with the link”", "Keep the role as Viewer. This lets GrowUpliftOS read the sheet; nobody can edit it."],
          ["Copy the link and paste it below", "From the Share window, or straight from the browser's address bar."],
        ].map(([title, text], index) => (
          <li key={title} className="flex gap-3">
            <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
            <span>
              <span className="block font-medium">{title}</span>
              <span className="block text-[13px] text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="grid gap-2">
        <Label htmlFor="sheet-url">Google Sheet link</Label>
        <Input id="sheet-url" type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" autoFocus aria-invalid={error !== ""} aria-describedby="sheet-url-help" />
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
        <p id="sheet-url-help" className="flex gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          Anyone who has this link can view the sheet, so use one that only holds lead details – and don't post the link publicly.
        </p>
      </div>
      <DialogFooter className={onBack ? "sm:justify-between" : undefined}>
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft /> Back
          </Button>
        )}
        <Button type="submit" disabled={preview.isPending}>
          {preview.isPending && <LoaderCircle className="animate-spin" />} Check sheet
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Connected sheets
 * ---------------------------------------------------------------------------------------------- */

function SourceRow({ source, onEdit, onDisconnect }: { source: LeadSourceDTO; onEdit: () => void; onDisconnect: () => void }) {
  const sync = useSyncSheet();
  // "Synced 5 minutes ago" is worked out when the row is drawn; it refreshes with every sync.
  const [now] = useState(() => Date.now());

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
        <FileSpreadsheet className="size-5" />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-medium">{source.name}</p>
        {source.lastSyncError ? (
          <p className="text-[13px] text-destructive">{source.lastSyncError}</p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {source.rowsImported} lead{source.rowsImported === 1 ? "" : "s"} imported
            {source.lastSyncedAt && ` · synced ${timeAgo(source.lastSyncedAt, Math.max(now, source.lastSyncedAt))}`}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={sync.isPending}
          onClick={() => sync.mutate(source.id, { onSuccess: (result) => toast.success(syncMessage(source.name, result.added)), onError: (error) => toast.error(errorMessage(error, "The sync failed. Please try again.")) })}
        >
          <RefreshCw className={sync.isPending ? "animate-spin" : undefined} /> Sync now
        </Button>
        <Button size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label={`Edit columns of ${source.name}`} title="Edit columns" onClick={onEdit}>
          <Settings2 />
        </Button>
        <Button asChild size="icon-sm" variant="ghost" className="text-muted-foreground">
          <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${source.name} in Google Sheets`} title="Open in Google Sheets">
            <ArrowUpRight />
          </a>
        </Button>
        <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label={`Disconnect ${source.name}`} title="Disconnect" onClick={onDisconnect}>
          <Unplug />
        </Button>
      </div>
    </li>
  );
}

type Step = { name: "list" } | { name: "link" } | { name: "map"; url: string; preview: SheetPreview } | { name: "edit"; source: LeadSourceDTO; preview: SheetPreview };

function SheetsBody({ onClose }: { onClose: () => void }) {
  const { data: sources, isPending } = useLeadSources();
  const connect = useConnectSheet();
  const update = useUpdateSheet();
  const disconnect = useDisconnectSheet();
  const preview = usePreviewSheet();
  const [step, setStep] = useState<Step | null>(null);
  const [removing, setRemoving] = useState<LeadSourceDTO | null>(null);

  if (isPending || !sources) return <Skeleton className="h-40 rounded-xl" role="status" aria-label="Loading sheets" />;
  // With nothing connected yet, go straight to "paste the link".
  const current: Step = step ?? (sources.length === 0 ? { name: "link" } : { name: "list" });

  if (current.name === "link") {
    return <LinkStep onBack={sources.length > 0 ? () => setStep({ name: "list" }) : undefined} onPreview={(url, data) => setStep({ name: "map", url, preview: data })} />;
  }
  if (current.name === "map") {
    return (
      <MappingStep
        preview={current.preview}
        initialName=""
        initialMapping={current.preview.suggestedMapping}
        submitLabel="Connect and import"
        saving={connect.isPending}
        onBack={() => setStep({ name: "link" })}
        onSubmit={(name, mapping) =>
          connect.mutate(
            { name, url: current.url, mapping },
            {
              onSuccess: (result) => {
                toast.success(result.added === 0 ? `${name} connected – no new leads yet` : `${name} connected – ${result.added} lead${result.added === 1 ? "" : "s"} imported`);
                onClose();
              },
              onError: (error) => {
                toast.error(errorMessage(error, "Could not connect the sheet."));
                if (error instanceof ApiError && error.fields.url) setStep({ name: "link" });
              },
            },
          )
        }
      />
    );
  }
  if (current.name === "edit") {
    return (
      <MappingStep
        preview={current.preview}
        initialName={current.source.name}
        initialMapping={current.source.mapping}
        submitLabel="Save"
        saving={update.isPending}
        onBack={() => setStep({ name: "list" })}
        onSubmit={(name, mapping) =>
          update.mutate(
            { id: current.source.id, input: { name, mapping } },
            {
              onSuccess: () => {
                toast.success("Columns saved – they apply from the next sync");
                setStep({ name: "list" });
              },
              onError: (error) => toast.error(errorMessage(error, "Could not save the columns.")),
            },
          )
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            onDisconnect={() => setRemoving(source)}
            onEdit={() => preview.mutate(source.url, { onSuccess: (data) => setStep({ name: "edit", source, preview: data }), onError: (error) => toast.error(errorMessage(error, "Could not read that sheet.")) })}
          />
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">Syncing adds rows that are new in the sheet. Leads you've already edited or deleted here are left alone, and the same phone or email is never added twice.</p>
      <DialogFooter>
        <Button variant="outline" onClick={() => setStep({ name: "link" })}>
          <Plus /> Connect another sheet
        </Button>
      </DialogFooter>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Disconnect “${removing?.name ?? ""}”?`}
        description="New rows from this sheet will no longer be imported. The leads already in your CRM stay."
        confirmLabel="Disconnect"
        onConfirm={() => {
          if (!removing) return;
          const { id } = removing;
          setRemoving(null);
          disconnect.mutate(id, { onSuccess: () => toast.success("Sheet disconnected"), onError: (error) => toast.error(errorMessage(error, "Could not disconnect the sheet.")) });
        }}
      />
    </div>
  );
}

/** Connect Google Sheets to the CRM, sync them and adjust which column feeds which field. */
export function SheetsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Google Sheets</DialogTitle>
          <DialogDescription>Bring leads in from a sheet – a form's responses, an ad lead export, or a list you keep by hand.</DialogDescription>
        </DialogHeader>
        {open && <SheetsBody onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
