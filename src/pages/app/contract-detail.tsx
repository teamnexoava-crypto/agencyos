import { useEffect, useRef, useState } from "react";
import { useDocumentTitle } from "@/lib/document-title";
import { ArrowLeft, Ban, Check, CopyPlus, Download, Eye, FilePlus2, Link2, LoaderCircle, MoreHorizontal, PenLine, Pencil, Printer, RefreshCw, Send, Share2, Trash2, TriangleAlert } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { unfilledVariables } from "@shared/contract";
import type { ContractDetail } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useContract, useContractAction, useDeleteContract, useUpdateContract, type ContractAction } from "@/features/contracts/api";
import { ContractDocument } from "@/features/contracts/contract-document";
import { contractUrl } from "@/features/contracts/meta";
import { RichEditor } from "@/features/contracts/rich-editor";
import { ShareDialog } from "@/features/contracts/share-dialog";
import { SignDialog } from "@/features/contracts/sign-dialog";
import { ContractStatusBadge } from "@/features/contracts/status-badge";
import { ApiError, errorMessage } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

const formatInstant = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms));

/* ------------------------------------------------------------------------------------------------
 * Draft: the text is still editable
 * ---------------------------------------------------------------------------------------------- */

function DraftEditor({ contract, onSent }: { contract: ContractDetail; onSent: () => void }) {
  const update = useUpdateContract(contract.id);
  const action = useContractAction(contract.id);
  const [title, setTitle] = useState(contract.title);
  const [content, setContent] = useState(contract.content);
  /** What the server last accepted, as typed here – compared against local edits to know if there is anything to save. */
  const [saved, setSaved] = useState({ title: contract.title, content: contract.content });
  const [failed, setFailed] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const titleValid = title.trim().length > 0;
  const dirty = title !== saved.title || content !== saved.content;
  const missing = unfilledVariables(content);
  const { mutateAsync, isPending: saving } = update;

  const save = async (): Promise<boolean> => {
    const snapshot = { title, content };
    try {
      await mutateAsync({ title: title.trim(), content });
      setSaved(snapshot);
      return true;
    } catch (error) {
      setFailed(true);
      toast.error(errorMessage(error, "Could not save the contract."));
      return false;
    }
  };
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Autosave shortly after typing stops. A failed save waits for the next edit rather than retrying in a loop.
  useEffect(() => {
    if (!dirty || !titleValid || saving || failed) return;
    const timer = window.setTimeout(() => void saveRef.current(), 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, titleValid, saving, failed, title, content]);

  // Leaving for another page inside the app: save what is pending right away instead of dropping it.
  const pendingRef = useRef(false);
  useEffect(() => {
    pendingRef.current = dirty && titleValid && !saving;
  });
  useEffect(
    () => () => {
      if (pendingRef.current) void saveRef.current();
    },
    [],
  );

  // Don't lose the last few keystrokes if the tab is closed mid-edit.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const send = async () => {
    if (dirty && !(await save())) return;
    action.mutate("send", { onSuccess: onSent, onError: (error) => toast.error(errorMessage(error, "Could not send the contract.")) });
  };
  const empty = content.trim() === "";

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="contract-title">Title</Label>
          <Input
            id="contract-title"
            value={title}
            maxLength={160}
            onChange={(event) => {
              setTitle(event.target.value);
              setFailed(false);
            }}
            aria-invalid={!titleValid}
            className="h-11 text-base font-medium"
          />
          {!titleValid && <p className="text-[13px] text-destructive">Give it a title</p>}
        </div>
        <RichEditor
          initialContent={contract.content}
          onChange={(html) => {
            setContent(html);
            setFailed(false);
          }}
          ariaLabel="Agreement text"
          className="[--editor-min-height:28rem]"
        />
      </div>

      <aside className="grid gap-4 xl:sticky xl:top-20" aria-label="Draft status">
        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Draft</h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              {saving ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" /> Saving…
                </>
              ) : dirty ? (
                failed ? (
                  "Not saved"
                ) : (
                  "Unsaved changes"
                )
              ) : (
                <>
                  <Check className="size-3.5 text-success" /> Saved
                </>
              )}
            </p>
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">Only your team can see this. When it's ready, send it – {contract.client.name} gets a link to read and sign online.</p>

          {missing.length > 0 && (
            <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p>
                Still to fill in: <span className="font-medium">{missing.map((key) => `{${key}}`).join(", ")}</span>. Replace {missing.length === 1 ? "it" : "them"} with the real details before sending.
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-2">
            <Button disabled={empty || !titleValid || saving || action.isPending} onClick={() => (missing.length > 0 ? setConfirmSend(true) : void send())}>
              {action.isPending ? <LoaderCircle className="animate-spin" /> : <Send />} Send for signature
            </Button>
            {failed && dirty && (
              <Button
                variant="outline"
                onClick={() => {
                  setFailed(false);
                  void save();
                }}
              >
                Try saving again
              </Button>
            )}
          </div>
          {empty && <p className="mt-2 text-[13px] text-muted-foreground">Write the agreement text to send it.</p>}
        </section>
      </aside>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Send with unfilled fields?"
        description={`The text still contains ${missing.map((key) => `{${key}}`).join(", ")}. Your client will see ${missing.length === 1 ? "it" : "them"} exactly like that.`}
        confirmLabel="Send anyway"
        destructive={false}
        onConfirm={() => {
          setConfirmSend(false);
          void send();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------------------------------- */

type Confirm = "unsend" | "void" | "link" | "version" | "delete" | null;

export default function ContractDetailPage() {
  const { contractId = "" } = useParams();
  const navigate = useNavigate();
  const { data: contract, isPending, error, refetch } = useContract(contractId);
  useDocumentTitle(contract?.title);
  const action = useContractAction(contractId);
  const deleteContract = useDeleteContract();
  const [shareOpen, setShareOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const back = (
    <Link to="/app/contracts" className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground print:hidden">
      <ArrowLeft className="size-4" /> Contracts
    </Link>
  );

  if (isPending) {
    return (
      <div role="status" aria-label="Loading contract">
        {back}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-[40rem] rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error || !contract) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        {back}
        <ErrorState title={missing ? "Contract not found" : undefined} description={missing ? "It may have been deleted." : undefined} onRetry={missing ? undefined : () => void refetch()} />
      </>
    );
  }

  const { status } = contract;
  const isDraft = status === "draft";
  const awaitingClient = status === "sent" || status === "viewed";
  const live = status !== "draft" && status !== "voided";
  const clientSignature = contract.signatures.find((signature) => signature.role === "client");
  const agencySignature = contract.signatures.find((signature) => signature.role === "agency");
  const deletable = isDraft || (status === "voided" && !clientSignature);
  const canVersion = !isDraft && !awaitingClient && !contract.nextVersionId;
  // A voided, superseded contract that the client had signed has nothing left to do: no empty menu.
  const hasMenu = live || Boolean(contract.signedFileId) || canVersion || deletable;

  const run = (name: ContractAction, success: string) =>
    action.mutate(name, {
      onSuccess: (result) => {
        toast.success(success);
        if (result.id !== contract.id) void navigate(`/app/contracts/${result.id}`);
      },
      onError: (err) => toast.error(errorMessage(err, "That didn't work. Please try again.")),
    });

  const timeline = [
    { icon: FilePlus2, label: "Created", at: contract.createdAt },
    { icon: Send, label: "Sent for signature", at: contract.sentAt },
    { icon: Eye, label: "Opened by client", at: contract.viewedAt },
    { icon: PenLine, label: `Signed by ${clientSignature?.name ?? "client"}`, at: clientSignature?.signedAt ?? null },
    { icon: Check, label: `Counter-signed by ${agencySignature?.name ?? "you"}`, at: agencySignature?.signedAt ?? null },
  ].filter((entry): entry is typeof entry & { at: number } => entry.at !== null);

  const statusCard = {
    sent: { title: "Waiting for the client", text: `${contract.client.name} hasn't opened the link yet.` },
    viewed: { title: "Opened, not signed yet", text: `${contract.client.name} has opened the contract. A gentle reminder often helps.` },
    client_signed: { title: "Your turn to sign", text: `${contract.client.name} has signed. Add your counter-signature to complete the contract.` },
    completed: { title: "Signed by both parties", text: "The text is locked. Download the PDF or the sealed copy for your records." },
    voided: { title: "Voided", text: "This contract was withdrawn. The client's link shows that it's no longer available." },
    draft: { title: "Draft", text: "" },
  }[status];

  return (
    <>
      {back}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between print:hidden">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xl font-semibold tracking-tight sm:text-[28px]">
            <span className="min-w-0 break-words">{contract.title}</span>
            {contract.version > 1 && <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Version {contract.version}</span>}
            <ContractStatusBadge status={status} className="text-[13px]" />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contract.clientId ? (
              <Link to={`/app/clients/${contract.clientId}`} className="font-medium text-foreground hover:text-primary">
                {contract.client.name}
              </Link>
            ) : (
              contract.client.name
            )}
            {contract.projectId && contract.projectTitle && (
              <>
                {" · "}
                <Link to={`/app/projects/${contract.projectId}?tab=contract`} className="hover:text-foreground">
                  {contract.projectTitle}
                </Link>
              </>
            )}
            {" · "}
            <span className="tabular">{contract.reference}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === "client_signed" && (
            <Button onClick={() => setSignOpen(true)}>
              <PenLine /> Counter-sign
            </Button>
          )}
          {live && (
            <Button variant={awaitingClient ? "default" : "outline"} onClick={() => setShareOpen(true)}>
              <Share2 /> {awaitingClient ? "Share link" : "Share"}
            </Button>
          )}
          {!isDraft && status !== "voided" && (
            <Button variant={status === "completed" ? "default" : "outline"} onClick={() => window.print()}>
              <Printer /> <span className="hidden sm:inline">Download PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          )}
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {live && (
                  <>
                    <DropdownMenuItem onSelect={() => void copyToClipboard(contractUrl(contract.publicToken), "Signing link copied")}>
                      <Link2 /> Copy client link
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={contractUrl(contract.publicToken)} target="_blank" rel="noopener noreferrer">
                        <Eye /> Open client view
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setConfirm("link")}>
                      <RefreshCw /> Reset client link
                    </DropdownMenuItem>
                  </>
                )}
                {contract.signedFileId && (
                  <DropdownMenuItem asChild>
                    <a href={`/api/files/${contract.signedFileId}`} download>
                      <Download /> Download sealed copy
                    </a>
                  </DropdownMenuItem>
                )}
                {live && <DropdownMenuSeparator />}
                {awaitingClient && (
                  <DropdownMenuItem onSelect={() => setConfirm("unsend")}>
                    <Pencil /> Edit text
                  </DropdownMenuItem>
                )}
                {canVersion && (
                  <DropdownMenuItem onSelect={() => setConfirm("version")}>
                    <CopyPlus /> Create new version
                  </DropdownMenuItem>
                )}
                {(awaitingClient || status === "client_signed") && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("void")}>
                    <Ban /> Void contract
                  </DropdownMenuItem>
                )}
                {deletable && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                    <Trash2 /> {isDraft ? "Delete draft" : "Delete contract"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {contract.nextVersionId && (
        <p className="mb-5 flex flex-wrap items-center gap-x-2 rounded-xl border bg-muted/50 px-4 py-3 text-sm print:hidden" role="status">
          A newer version of this contract exists.
          <Link to={`/app/contracts/${contract.nextVersionId}`} className="font-medium text-primary hover:underline">
            Open version {contract.version + 1}
          </Link>
        </p>
      )}

      {isDraft ? (
        <DraftEditor key={contract.id} contract={contract} onSent={() => setShareOpen(true)} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <ContractDocument contract={contract} />

          <aside className="grid gap-4 print:hidden" aria-label="Contract status">
            <section className="rounded-2xl border bg-card p-5 shadow-soft">
              <h2 className="text-sm font-semibold">{statusCard.title}</h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">{statusCard.text}</p>
              {status === "client_signed" && (
                <Button className="mt-4 w-full" onClick={() => setSignOpen(true)}>
                  <PenLine /> Counter-sign now
                </Button>
              )}
              {awaitingClient && (
                <Button className="mt-4 w-full" variant="outline" onClick={() => setShareOpen(true)}>
                  <Share2 /> Send the link again
                </Button>
              )}
              {contract.signedFileId && (
                <Button asChild className="mt-4 w-full" variant="outline">
                  <a href={`/api/files/${contract.signedFileId}`} download>
                    <Download /> Download sealed copy
                  </a>
                </Button>
              )}
              {contract.previousVersionId && (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  Replaces{" "}
                  <Link to={`/app/contracts/${contract.previousVersionId}`} className="font-medium text-foreground hover:text-primary">
                    version {contract.version - 1}
                  </Link>
                  .
                </p>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="signers-heading">
              <h2 id="signers-heading" className="mb-3 text-sm font-semibold">
                Signers
              </h2>
              <ul className="space-y-3 text-sm">
                {[
                  { who: contract.client.name, role: "Client", signature: clientSignature },
                  { who: contract.agency.name, role: "Agency", signature: agencySignature },
                ].map((signer) => (
                  <li key={signer.role} className="flex items-center gap-3">
                    <span
                      className={
                        signer.signature
                          ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                          : "flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      }
                    >
                      {signer.signature ? <Check className="size-3.5" /> : <PenLine className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{signer.signature?.name ?? signer.who}</span>
                      <span className="block text-xs text-muted-foreground">
                        {signer.role} · {signer.signature ? `Signed ${formatInstant(signer.signature.signedAt)}` : "Not signed yet"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="contract-timeline-heading">
              <h2 id="contract-timeline-heading" className="mb-3 text-sm font-semibold">
                Timeline
              </h2>
              <ol className="space-y-3">
                {timeline.map((entry) => (
                  <li key={entry.label} className="flex items-center gap-3 text-sm">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <entry.icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    <time className="shrink-0 text-xs text-muted-foreground">{formatInstant(entry.at)}</time>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      )}

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} contract={contract} />
      <SignDialog open={signOpen} onOpenChange={setSignOpen} contract={contract} />

      <ConfirmDialog
        open={confirm === "unsend"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Take it back to edit?"
        description="The contract becomes a draft again and the client's link stops working until you send it again."
        confirmLabel="Edit text"
        destructive={false}
        onConfirm={() => {
          setConfirm(null);
          run("unsend", "Back to draft – edit and send again");
        }}
      />
      <ConfirmDialog
        open={confirm === "void"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Void this contract?"
        description="It can no longer be signed, and the client's link will say it was withdrawn. This can't be undone."
        confirmLabel="Void contract"
        onConfirm={() => {
          setConfirm(null);
          run("void", "Contract voided");
        }}
      />
      <ConfirmDialog
        open={confirm === "link"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Reset the client link?"
        description="The current link stops working immediately. You'll need to share the new one with your client."
        confirmLabel="Reset link"
        onConfirm={() => {
          setConfirm(null);
          run("link", "New link created – share it again");
        }}
      />
      <ConfirmDialog
        open={confirm === "version"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Create a new version?"
        description={
          status === "completed"
            ? "A signed contract can't be edited. This makes a new draft with the same text for you to change and send again. The signed version stays on record."
            : status === "client_signed"
              ? "This makes a new draft with the same text and voids this one – your client will need to sign the new version."
              : "This makes a new draft with the same text for you to change and send."
        }
        confirmLabel="Create new version"
        destructive={false}
        onConfirm={() => {
          setConfirm(null);
          run("version", "New version created as a draft");
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={isDraft ? "Delete this draft?" : "Delete this contract?"}
        description={`“${contract.title}” will be removed. This can't be undone.`}
        onConfirm={() => {
          setConfirm(null);
          deleteContract.mutate(contract.id, {
            onSuccess: () => {
              toast.success("Contract deleted");
              void navigate("/app/contracts", { replace: true });
            },
            onError: (err) => toast.error(errorMessage(err, "Could not delete the contract.")),
          });
        }}
      />
    </>
  );
}
