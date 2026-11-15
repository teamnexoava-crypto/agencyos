import { renderSVG } from "uqr";
import { formatIndianDate } from "@shared/dates";
import { computeInvoiceTotals, formatRate, upiPaymentUrl } from "@shared/invoice";
import type { InvoiceDocument as InvoiceDocumentData } from "@shared/types";
import { formatMoney, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "2026-11-13" → "13 Nov 2026" – invoices always show the year. */
function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return formatIndianDate(date, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const quantityText = (quantity: number) => (Number.isFinite(quantity) ? String(Number(quantity.toFixed(3))) : "");

function UpiQr({ invoice, balance }: { invoice: InvoiceDocumentData; balance: number }) {
  if (!invoice.upiId) return null;
  const url = upiPaymentUrl({ upiId: invoice.upiId, payeeName: invoice.from.name, amount: balance, note: `Invoice ${invoice.number}` });
  // Rendered to an SVG string and shown through <img>, so no markup is ever injected into the page.
  const svg = renderSVG(url, { ecc: "M", border: 2 });
  return (
    <div className="flex items-center gap-3">
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt={`UPI QR code to pay ${formatMoney(balance, invoice.currency)}`} className="size-24 shrink-0 rounded-md border border-zinc-200 bg-white" />
      <div className="text-xs text-zinc-500">
        <p className="font-medium text-zinc-700">Scan to pay with any UPI app</p>
        <p className="mt-0.5 break-all">{invoice.upiId}</p>
      </div>
    </div>
  );
}

interface InvoiceDocumentProps {
  invoice: InvoiceDocumentData;
  className?: string;
}

/**
 * The invoice as the client sees it: used for the live preview while editing, the detail page, the
 * public /i/:token page and – through the print stylesheet – the PDF. Always rendered as light
 * "paper" regardless of the app theme. The agency's brand colour is the only accent.
 */
export function InvoiceDocument({ invoice, className }: InvoiceDocumentProps) {
  const money = (minor: number) => formatMoney(minor, invoice.currency);
  const totals = computeInvoiceTotals({ ...invoice, items: invoice.items });
  const balance = invoice.total - invoice.amountPaid;
  const paid = invoice.status === "paid";
  const accent = invoice.from.brandColor;
  const showUpi = Boolean(invoice.upiId) && balance > 0 && invoice.currency === "INR" && invoice.status !== "cancelled";

  return (
    <article
      className={cn("print-area relative overflow-hidden rounded-2xl border border-zinc-200 bg-white text-[13px] leading-relaxed text-zinc-800 shadow-lift [color-scheme:light]", className)}
      aria-label={`Invoice ${invoice.number}`}
    >
      <div aria-hidden="true" className="h-1.5 w-full print:h-1" style={{ backgroundColor: accent }} />

      <div className="p-6 sm:p-10 print:p-0 print:pt-6">
        {/* From / title */}
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            {invoice.from.logoUrl ? (
              <img src={invoice.from.logoUrl} alt="" className="size-14 shrink-0 rounded-xl border border-zinc-200 bg-white object-contain" />
            ) : (
              <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white" style={{ backgroundColor: accent }}>
                {initials(invoice.from.name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-lg leading-tight font-semibold text-zinc-900">{invoice.from.name}</p>
              {invoice.from.address && <p className="mt-1 whitespace-pre-line text-zinc-500">{invoice.from.address}</p>}
              <p className="mt-1 text-zinc-500">{[invoice.from.phone, invoice.from.email].filter(Boolean).join(" · ")}</p>
              {invoice.from.gstNumber && <p className="tabular text-zinc-500">GSTIN {invoice.from.gstNumber}</p>}
            </div>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-2xl font-semibold tracking-tight text-zinc-900 uppercase">Invoice</p>
            <p className="tabular mt-0.5 text-base font-medium" style={{ color: accent }}>
              {invoice.number}
            </p>
            {(paid || invoice.status === "cancelled") && (
              <p
                className={cn(
                  "mt-2 inline-block rounded-md border-2 px-2.5 py-0.5 text-xs font-bold tracking-widest uppercase",
                  paid ? "border-emerald-600 text-emerald-700" : "border-zinc-400 text-zinc-500",
                )}
              >
                {paid ? "Paid" : "Cancelled"}
              </p>
            )}
          </div>
        </header>

        {/* Bill to / dates */}
        <section className="mt-8 grid gap-6 border-t border-zinc-100 pt-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase">Bill to</p>
            <p className="mt-1.5 text-[15px] font-semibold text-zinc-900">{invoice.to.company ?? invoice.to.name}</p>
            {invoice.to.company && <p className="text-zinc-600">{invoice.to.name}</p>}
            {invoice.to.address && <p className="mt-0.5 whitespace-pre-line text-zinc-500">{invoice.to.address}</p>}
            {invoice.to.email && <p className="text-zinc-500">{invoice.to.email}</p>}
            {invoice.to.gstNumber && <p className="tabular text-zinc-500">GSTIN {invoice.to.gstNumber}</p>}
          </div>
          <dl className="grid h-fit grid-cols-[auto_auto] gap-x-6 gap-y-1.5 sm:text-right">
            <dt className="text-zinc-500 sm:text-left">Issue date</dt>
            <dd className="tabular font-medium text-zinc-900">{longDate(invoice.issueDate)}</dd>
            <dt className="text-zinc-500 sm:text-left">Due date</dt>
            <dd className="tabular font-medium text-zinc-900">{longDate(invoice.dueDate)}</dd>
            {invoice.projectTitle && (
              <>
                <dt className="text-zinc-500 sm:text-left">Project</dt>
                <dd className="max-w-52 font-medium text-zinc-900">{invoice.projectTitle}</dd>
              </>
            )}
          </dl>
        </section>

        {/* Line items */}
        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-zinc-900/80 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
              <th scope="col" className="py-2 pr-3 text-left">
                Description
              </th>
              <th scope="col" className="w-14 px-2 py-2 text-right sm:w-20">
                Qty
              </th>
              <th scope="col" className="hidden w-28 px-2 py-2 text-right sm:table-cell">
                Rate
              </th>
              <th scope="col" className="w-24 py-2 pl-2 text-right sm:w-32">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-zinc-400">
                  No line items yet
                </td>
              </tr>
            )}
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-zinc-100 align-top">
                <td className="py-2.5 pr-3 break-words whitespace-pre-line text-zinc-900">
                  {item.description || <span className="text-zinc-400">Description</span>}
                  <span className="tabular mt-0.5 block text-xs text-zinc-500 sm:hidden">@ {money(item.rate)}</span>
                </td>
                <td className="tabular px-2 py-2.5 text-right text-zinc-600">{quantityText(item.quantity)}</td>
                <td className="tabular hidden px-2 py-2.5 text-right text-zinc-600 sm:table-cell">{money(item.rate)}</td>
                <td className="tabular py-2.5 pl-2 text-right font-medium text-zinc-900">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Subtotal</dt>
              <dd className="tabular text-zinc-900">{money(totals.subtotal)}</dd>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Discount{invoice.discountType === "percent" && ` (${formatRate(invoice.discountValue)})`}</dt>
                <dd className="tabular text-zinc-900">− {money(totals.discountAmount)}</dd>
              </div>
            )}
            {totals.taxLines.map((line) => (
              <div key={line.label} className="flex justify-between gap-4">
                <dt className="text-zinc-500">
                  {line.label} ({formatRate(line.rate)})
                </dt>
                <dd className="tabular text-zinc-900">{money(line.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2 text-[15px] font-semibold text-zinc-900">
              <dt>Total</dt>
              <dd className="tabular">{money(totals.total)}</dd>
            </div>
            {invoice.amountPaid > 0 && (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Paid</dt>
                  <dd className="tabular text-emerald-700">− {money(invoice.amountPaid)}</dd>
                </div>
                <div className="flex justify-between gap-4 rounded-lg px-3 py-2 text-[15px] font-semibold text-white print:px-0 print:text-zinc-900" style={{ backgroundColor: accent }}>
                  <dt>Balance due</dt>
                  <dd className="tabular">{money(Math.max(0, totals.total - invoice.amountPaid))}</dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {/* Payment details / notes */}
        {(showUpi || invoice.bankDetails || invoice.notes || invoice.terms) && (
          <footer className="mt-8 grid gap-6 border-t border-zinc-100 pt-6 sm:grid-cols-2">
            {(showUpi || invoice.bankDetails) && (
              <div className="space-y-4">
                <p className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase">Payment details</p>
                {invoice.bankDetails && <p className="whitespace-pre-line text-zinc-600">{invoice.bankDetails}</p>}
                {showUpi && <UpiQr invoice={invoice} balance={balance} />}
              </div>
            )}
            {(invoice.notes || invoice.terms) && (
              <div className="space-y-4">
                {invoice.notes && (
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase">Notes</p>
                    <p className="mt-1.5 whitespace-pre-line text-zinc-600">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase">Terms</p>
                    <p className="mt-1.5 whitespace-pre-line text-zinc-600">{invoice.terms}</p>
                  </div>
                )}
              </div>
            )}
          </footer>
        )}
      </div>
    </article>
  );
}
