import { useState } from "react";
import { ArrowLeft, Ban, Check, CircleDollarSign, Eye, FilePlus2, Link2, MoreHorizontal, Pencil, Printer, RefreshCw, Send, Share2, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteInvoice, useDeletePayment, useInvoice, useInvoiceAction } from "@/features/invoices/api";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { PAYMENT_METHOD_LABEL, invoiceUrl } from "@/features/invoices/meta";
import { PaymentDialog } from "@/features/invoices/payment-dialog";
import { ShareDialog } from "@/features/invoices/share-dialog";
import { InvoiceStatusBadge } from "@/features/invoices/status-badge";
import { ApiError, errorMessage } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const formatInstant = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms));

type Confirm = "cancel" | "delete" | "link" | { paymentId: string } | null;

export default function InvoiceDetailPage() {
  const { invoiceId = "" } = useParams();
  const navigate = useNavigate();
  const { data: invoice, isPending, error, refetch } = useInvoice(invoiceId);
  const action = useInvoiceAction(invoiceId);
  const deleteInvoice = useDeleteInvoice();
  const deletePayment = useDeletePayment(invoiceId);
  const [shareOpen, setShareOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const back = (
    <Link to="/app/invoices" className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground print:hidden">
      <ArrowLeft className="size-4" /> Invoices
    </Link>
  );

  if (isPending) {
    return (
      <div role="status" aria-label="Loading invoice">
        {back}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-[40rem] rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error || !invoice) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        {back}
        <ErrorState title={missing ? "Invoice not found" : undefined} description={missing ? "It may have been deleted." : undefined} onRetry={missing ? undefined : () => void refetch()} />
      </>
    );
  }

  const balance = invoice.total - invoice.amountPaid;
  const isDraft = invoice.status === "draft";
  const isCancelled = invoice.status === "cancelled";
  const editable = invoice.amountPaid === 0 && !isCancelled;
  const canTakePayment = balance > 0 && !isCancelled;
  const run = (name: "send" | "cancel" | "link", success: string) =>
    action.mutate(name, { onSuccess: () => toast.success(success), onError: (err) => toast.error(errorMessage(err, "That didn't work. Please try again.")) });
  /** Sharing a draft is what sends it. */
  const markSentIfDraft = () => {
    if (isDraft && !action.isPending) action.mutate("send");
  };

  const timeline = [
    { icon: FilePlus2, label: "Created", at: invoice.createdAt },
    { icon: Send, label: "Sent", at: invoice.sentAt },
    { icon: Eye, label: "Viewed by client", at: invoice.viewedAt },
    { icon: Check, label: "Paid in full", at: invoice.paidAt },
  ].filter((entry): entry is typeof entry & { at: number } => entry.at !== null);

  return (
    <>
      {back}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between print:hidden">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight sm:text-[28px]">
            <span className="tabular">{invoice.number}</span>
            <InvoiceStatusBadge invoice={invoice} className="text-[13px]" />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.clientId ? (
              <Link to={`/app/clients/${invoice.clientId}`} className="font-medium text-foreground hover:text-primary">
                {invoice.to.name}
              </Link>
            ) : (
              invoice.to.name
            )}
            {invoice.projectId && invoice.projectTitle && (
              <>
                {" · "}
                <Link to={`/app/projects/${invoice.projectId}`} className="hover:text-foreground">
                  {invoice.projectTitle}
                </Link>
              </>
            )}
            {" · "}Due {formatDate(invoice.dueDate)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canTakePayment && (
            <Button onClick={() => setPaymentOpen(true)}>
              <CircleDollarSign /> Record payment
            </Button>
          )}
          {!isCancelled && (
            <Button variant={canTakePayment ? "outline" : "default"} onClick={() => setShareOpen(true)}>
              <Share2 /> Share
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {editable && (
                <DropdownMenuItem asChild>
                  <Link to={`/app/invoices/${invoice.id}/edit`}>
                    <Pencil /> Edit invoice
                  </Link>
                </DropdownMenuItem>
              )}
              {isDraft && (
                <DropdownMenuItem onSelect={() => run("send", "Marked as sent")}>
                  <Send /> Mark as sent
                </DropdownMenuItem>
              )}
              {!isDraft && !isCancelled && (
                <>
                  <DropdownMenuItem onSelect={() => void copyToClipboard(invoiceUrl(invoice.publicToken), "Invoice link copied")}>
                    <Link2 /> Copy public link
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={invoiceUrl(invoice.publicToken)} target="_blank" rel="noopener noreferrer">
                      <Eye /> Open client view
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirm("link")}>
                    <RefreshCw /> Reset public link
                  </DropdownMenuItem>
                </>
              )}
              {(editable || isDraft) && <DropdownMenuSeparator />}
              {isDraft ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                  <Trash2 /> Delete draft
                </DropdownMenuItem>
              ) : (
                editable && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("cancel")}>
                    <Ban /> Cancel invoice
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <InvoiceDocument invoice={invoice} />

        <aside className="grid gap-4 print:hidden" aria-label="Invoice status and payments">
          <section className="rounded-2xl border bg-card p-5 shadow-soft">
            <p className="text-sm text-muted-foreground">{balance > 0 && !isCancelled ? "Balance due" : isCancelled ? "Cancelled" : "Paid in full"}</p>
            <p className={cn("tabular mt-1 text-3xl font-semibold tracking-tight", balance === 0 && !isCancelled && "text-success")}>
              {formatMoney(isCancelled ? invoice.total : balance > 0 ? balance : invoice.total, invoice.currency)}
            </p>
            {invoice.amountPaid > 0 && balance > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {formatMoney(invoice.amountPaid, invoice.currency)} of {formatMoney(invoice.total, invoice.currency)} received
              </p>
            )}
            {isDraft && <p className="mt-3 rounded-xl bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground">This is a draft – the client can't see it until you share it or mark it as sent.</p>}
          </section>

          <section className="rounded-2xl border bg-card shadow-soft" aria-labelledby="payments-heading">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <h2 id="payments-heading" className="text-sm font-semibold">
                Payments
              </h2>
              {canTakePayment && (
                <Button variant="ghost" size="sm" onClick={() => setPaymentOpen(true)}>
                  Add
                </Button>
              )}
            </div>
            {invoice.payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {invoice.payments.map((payment) => (
                  <li key={payment.id} className="group flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="tabular text-sm font-medium">{formatMoney(payment.amount, invoice.currency)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(payment.date)} · {PAYMENT_METHOD_LABEL[payment.method]}
                        {payment.reference && ` · ${payment.reference}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove payment of ${formatMoney(payment.amount, invoice.currency)}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirm({ paymentId: payment.id })}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="mb-3 text-sm font-semibold">
              Timeline
            </h2>
            <ol className="space-y-3">
              {timeline.map((entry) => (
                <li key={entry.label} className="flex items-center gap-3 text-sm">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <entry.icon className="size-3.5" />
                  </span>
                  <span className="flex-1">{entry.label}</span>
                  <time className="text-xs text-muted-foreground">{formatInstant(entry.at)}</time>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} invoice={invoice} onShared={markSentIfDraft} />
      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoice={invoice} />

      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Cancel invoice ${invoice.number}?`}
        description="The client's link will show it as cancelled and it will no longer count as billed. The number stays reserved."
        confirmLabel="Cancel invoice"
        onConfirm={() => {
          setConfirm(null);
          run("cancel", "Invoice cancelled");
        }}
      />
      <ConfirmDialog
        open={confirm === "link"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Reset the public link?"
        description="The current link stops working immediately. You'll need to share the new one with your client."
        confirmLabel="Reset link"
        onConfirm={() => {
          setConfirm(null);
          run("link", "New link created – share it again");
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this draft?"
        description={`${invoice.number} will be removed. This can't be undone.`}
        onConfirm={() => {
          setConfirm(null);
          deleteInvoice.mutate(invoice.id, {
            onSuccess: () => {
              toast.success("Draft deleted");
              void navigate("/app/invoices", { replace: true });
            },
            onError: (err) => toast.error(errorMessage(err, "Could not delete the draft.")),
          });
        }}
      />
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Remove this payment?"
        description="The invoice's balance and status will be recalculated."
        confirmLabel="Remove payment"
        onConfirm={() => {
          if (typeof confirm !== "object" || confirm === null) return;
          const { paymentId } = confirm;
          setConfirm(null);
          deletePayment.mutate(paymentId, { onSuccess: () => toast.success("Payment removed"), onError: (err) => toast.error(errorMessage(err, "Could not remove the payment.")) });
        }}
      />
    </>
  );
}
