import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Copy, ExternalLink, Eye, Link2, LoaderCircle, MessageCircle, MessagesSquare, RefreshCw, SendHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ShareLinkInput } from "@shared/schemas/portal";
import type { ProjectDetail, ShareLinkDTO } from "@shared/types";
import { formatIndianDate } from "@shared/dates";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsLocked } from "@/features/billing/locked";
import { UpgradeNotice } from "@/features/billing/upgrade-notice";
import { useClient } from "@/features/clients/api";
import { errorMessage } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { whatsappUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { portalUrl, useDeleteComment, usePostComment, useProjectComments, useRegenerateShareLink, useSaveShareLink, useShareLink } from "./api";

const formatInstant = (ms: number) => formatIndianDate(new Date(ms), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const DEFAULTS: ShareLinkInput = { enabled: true, showInvoices: true, showContract: true, showFiles: true, allowComments: true };
const settingsOf = (link: ShareLinkDTO): ShareLinkInput => ({
  enabled: link.enabled,
  showInvoices: link.showInvoices,
  showContract: link.showContract,
  showFiles: link.showFiles,
  allowComments: link.allowComments,
});

const SECTIONS: { key: Exclude<keyof ShareLinkInput, "enabled">; label: string; hint: string }[] = [
  { key: "showInvoices", label: "Invoices", hint: "Sent invoices with their status, to view and pay." },
  { key: "showContract", label: "Contract", hint: "The agreement, to review, sign and download." },
  { key: "showFiles", label: "Files", hint: "Only files you mark as “Visible to client”." },
  { key: "allowComments", label: "Messages", hint: "Let the client leave messages for your team." },
];

function Messages({ projectId, clientCanWrite }: { projectId: string; clientCanWrite: boolean }) {
  const { data: comments, isPending } = useProjectComments(projectId);
  const post = usePostComment(projectId);
  const remove = useDeleteComment(projectId);
  const [body, setBody] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const count = comments?.length ?? 0;

  // Keep the newest message in view by scrolling the thread itself – never the whole page.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [count]);

  const send = () => {
    const text = body.trim();
    if (!text) return;
    post.mutate(text, { onSuccess: () => setBody(""), onError: (error) => toast.error(errorMessage(error, "Could not send the message.")) });
  };

  return (
    <section className="rounded-2xl border bg-card shadow-soft" aria-labelledby="messages-heading">
      <div className="border-b px-5 py-3.5">
        <h2 id="messages-heading" className="text-sm font-semibold">
          Messages
        </h2>
        <p className="text-[13px] text-muted-foreground">{clientCanWrite ? "What your client writes on their page shows up here. Replies appear on their page." : "Messages are switched off on the client's page."}</p>
      </div>

      {isPending ? (
        <div className="p-5">
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : count === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-muted-foreground">
          <MessagesSquare className="size-5" />
          No messages yet.
        </div>
      ) : (
        <ul ref={list} className="max-h-96 space-y-3 overflow-y-auto p-5" aria-live="polite">
          {(comments ?? []).map((comment) => {
            const mine = comment.authorType === "member";
            return (
              <li key={comment.id} className={cn("group flex items-end gap-2", mine && "flex-row-reverse")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>
                  <p className={cn("mb-0.5 text-xs font-medium", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {comment.authorName}
                    {!mine && " · Client"} · {formatInstant(comment.createdAt)}
                  </p>
                  <p className="break-words whitespace-pre-wrap">{comment.body}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete message from ${comment.authorName}`}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  onClick={() => remove.mutate(comment.id, { onError: (error) => toast.error(errorMessage(error, "Could not delete the message.")) })}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send();
          }}
          rows={1}
          maxLength={2000}
          placeholder="Write a reply…"
          aria-label="Reply to the client"
          className="max-h-32 min-h-9 resize-none"
        />
        <Button type="submit" size="icon" disabled={post.isPending || body.trim() === ""} aria-label="Send reply">
          {post.isPending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </form>
    </section>
  );
}

/** The private page a client follows their project on: switch it on, choose what it shows, share the link. */
export function ClientLinkTab({ project }: { project: ProjectDetail }) {
  const { data: link, isPending, isError, refetch } = useShareLink(project.id);
  const { data: client } = useClient(project.clientId ?? "", Boolean(project.clientId));
  const save = useSaveShareLink(project.id);
  const regenerate = useRegenerateShareLink(project.id);
  const [confirmReset, setConfirmReset] = useState(false);
  const locked = useIsLocked("portal");

  if (locked) return <UpgradeNotice feature="portal" />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-64 rounded-2xl" role="status" aria-label="Loading client portal" />;

  const change = (patch: Partial<ShareLinkInput>, success?: string) =>
    save.mutate(
      { ...(link ? settingsOf(link) : DEFAULTS), ...patch },
      { onSuccess: () => success && toast.success(success), onError: (error) => toast.error(errorMessage(error, "Could not update the client portal.")) },
    );

  if (!link) {
    return (
      <EmptyState
        icon={Link2}
        title="Give your client one link for everything"
        description="A private page with live progress, milestones, invoices, the contract and shared files. No login needed – and never any internal costs or notes."
        action={
          <Button onClick={() => change({}, "Client portal created")} disabled={save.isPending}>
            {save.isPending ? <LoaderCircle className="animate-spin" /> : <Link2 />} Create client portal
          </Button>
        }
      />
    );
  }

  const url = portalUrl(link.token);
  const message = `Hi ${project.clientName ?? "there"}, you can follow the progress of ${project.title} here: ${url}`;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="grid gap-6">
        <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="client-link-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="client-link-heading" className="text-sm font-semibold">
                Client portal
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{link.enabled ? "Anyone with this link can open the page – share it only with your client." : "Switched off. The link shows “not available” until you turn it back on."}</p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
              <Switch checked={link.enabled} onCheckedChange={(enabled) => change({ enabled }, enabled ? "Client portal is on" : "Client portal is off")} aria-label="Client portal on" />
              {link.enabled ? "On" : "Off"}
            </label>
          </div>

          <motion.div animate={{ opacity: link.enabled ? 1 : 0.5 }} transition={{ duration: 0.2 }} className="mt-4 grid gap-3">
            <div className="flex gap-2">
              <Input readOnly value={url} onFocus={(event) => event.target.select()} aria-label="Client portal link" className="tabular sm:text-[13px]" />
              <Button variant="outline" className="shrink-0" onClick={() => void copyToClipboard(url, "Portal link copied")}>
                <Copy /> Copy
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-[#25D366] text-white hover:bg-[#1fb957]">
                <a href={whatsappUrl(client?.whatsapp, message)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle /> Share on WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Preview
                </a>
              </Button>
              <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirmReset(true)} disabled={regenerate.isPending}>
                <RefreshCw className={cn(regenerate.isPending && "animate-spin")} /> New link
              </Button>
            </div>
          </motion.div>

          <p className="mt-4 flex items-center gap-1.5 border-t pt-3.5 text-[13px] text-muted-foreground">
            <Eye className="size-3.5" />
            {link.viewCount === 0 ? "Not opened yet." : `Opened ${link.viewCount} time${link.viewCount === 1 ? "" : "s"}${link.lastViewedAt ? ` · last on ${formatInstant(link.lastViewedAt)}` : ""}.`}
          </p>
        </section>

        <section className="rounded-2xl border bg-card shadow-soft" aria-labelledby="client-sees-heading">
          <div className="border-b px-5 py-3.5">
            <h2 id="client-sees-heading" className="text-sm font-semibold">
              What the client sees
            </h2>
            <p className="text-[13px] text-muted-foreground">Progress and milestones are always shown. Budgets, expenses, profit, tasks and internal notes never are.</p>
          </div>
          <ul className="divide-y">
            {SECTIONS.map((section) => (
              <li key={section.key}>
                <label className="flex cursor-pointer items-center gap-4 px-5 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{section.label}</span>
                    <span className="block text-[13px] text-muted-foreground">{section.hint}</span>
                  </span>
                  <Switch checked={link[section.key]} onCheckedChange={(checked) => change({ [section.key]: checked })} aria-label={`Show ${section.label.toLowerCase()} to the client`} />
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Messages projectId={project.id} clientCanWrite={link.enabled && link.allowComments} />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Create a new portal link?"
        description="The current link stops working immediately. You'll need to send the new one to your client."
        confirmLabel="Create new link"
        onConfirm={() => {
          setConfirmReset(false);
          regenerate.mutate(undefined, { onSuccess: () => toast.success("New link created – share it again"), onError: (error) => toast.error(errorMessage(error, "Could not create a new link.")) });
        }}
      />
    </div>
  );
}
