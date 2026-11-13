import { motion } from "motion/react";
import { CircleCheckBig, Clock, FileX2, Printer, Smartphone } from "lucide-react";
import { useParams } from "react-router";
import { invoiceDisplayStatus, upiPaymentUrl } from "@shared/invoice";
import { BrandMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicInvoice } from "@/features/invoices/api";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

/** /i/:token – what the client sees. No login, no app chrome, and only client-safe data from the API. */
export default function PublicInvoicePage() {
  const { token = "" } = useParams();
  const { data: invoice, isPending } = usePublicInvoice(token);

  if (isPending) {
    return (
      <div className="min-h-dvh bg-muted/40 px-4 py-8" role="status" aria-label="Loading invoice">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-[44rem] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <FileX2 className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">This invoice isn't available</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The link may be incorrect or may have been replaced. Please ask the sender for a new link.</p>
      </div>
    );
  }

  const balance = invoice.total - invoice.amountPaid;
  const status = invoiceDisplayStatus(invoice, todayIso());
  const paid = status === "paid";
  const cancelled = status === "cancelled";
  const canPayByUpi = Boolean(invoice.upiId) && balance > 0 && !cancelled && invoice.currency === "INR";

  const banner = paid
    ? { icon: CircleCheckBig, tone: "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300", text: "This invoice has been paid in full. Thank you!" }
    : cancelled
      ? { icon: FileX2, tone: "border-border bg-muted text-muted-foreground", text: "This invoice has been cancelled. No payment is due." }
      : status === "overdue"
        ? { icon: Clock, tone: "border-rose-600/30 bg-rose-500/10 text-rose-800 dark:text-rose-300", text: `${formatMoney(balance, invoice.currency)} was due on ${formatDate(invoice.dueDate)}.` }
        : { icon: Clock, tone: "border-border bg-card text-foreground", text: `${formatMoney(balance, invoice.currency)} due by ${formatDate(invoice.dueDate)}.` };

  return (
    <div className="min-h-dvh bg-muted/40 print:bg-white">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{invoice.from.name}</p>
            <p className="tabular truncate text-xs text-muted-foreground">Invoice {invoice.number}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canPayByUpi && invoice.upiId && (
              // UPI links only open on phones with a UPI app installed; on desktop the QR code on the invoice does the job.
              <Button asChild className="sm:hidden">
                <a href={upiPaymentUrl({ upiId: invoice.upiId, payeeName: invoice.from.name, amount: balance, note: `Invoice ${invoice.number}` })}>
                  <Smartphone /> Pay {formatMoney(balance, invoice.currency)}
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> <span className="hidden sm:inline">Download PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8 print:max-w-none print:p-0">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          role="status"
          className={cn("mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium print:hidden", banner.tone)}
        >
          <banner.icon className="size-4 shrink-0" />
          {banner.text}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}>
          <InvoiceDocument invoice={invoice} />
        </motion.div>

        <footer className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground print:hidden">
          <BrandMark className="size-4" />
          <span>
            Sent with{" "}
            <a href="/" className="font-medium hover:text-foreground">
              AgencyOS
            </a>
          </span>
        </footer>
      </main>
    </div>
  );
}
