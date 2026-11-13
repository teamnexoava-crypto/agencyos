import { CURRENCIES, type CurrencyCode } from "@shared/constants";
import { formatInvoiceNumber } from "@shared/schemas/workspace";
import { WorkspaceLogo } from "@/components/shared/workspace-logo";

interface InvoicePreviewProps {
  name: string;
  logoUrl: string | null;
  currency: CurrencyCode;
  gstNumber: string;
  address: string;
  phone: string;
  invoicePrefix: string;
}

function formatSample(amount: number, currency: CurrencyCode): string {
  const locale = CURRENCIES.find((c) => c.code === currency)?.locale ?? "en-IN";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/** Live "this is how your invoices will look" card shown beside the onboarding form. */
export function InvoicePreview({ name, logoUrl, currency, gstNumber, address, phone, invoicePrefix }: InvoicePreviewProps) {
  const displayName = name.trim() || "Your agency";
  const prefix = invoicePrefix.trim().toUpperCase() || "INV";

  return (
    <div className="w-full max-w-md rounded-2xl border bg-white p-7 text-zinc-900 shadow-pop" aria-label="Invoice preview">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <WorkspaceLogo name={displayName} logoUrl={logoUrl} className="size-11 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{displayName}</p>
            {gstNumber.trim() && <p className="truncate text-xs text-zinc-500">GSTIN {gstNumber.trim().toUpperCase()}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase">Invoice</p>
          <p className="tabular text-sm font-semibold">{formatInvoiceNumber(prefix, 1)}</p>
        </div>
      </div>

      {(address.trim() || phone.trim()) && (
        <p className="mt-4 line-clamp-3 text-xs leading-relaxed whitespace-pre-line text-zinc-500">
          {[address.trim(), phone.trim()].filter(Boolean).join("\n")}
        </p>
      )}

      <div className="mt-6 space-y-2.5 border-t border-zinc-100 pt-5 text-sm">
        {[
          { label: "Brand identity design", amount: 45000 },
          { label: "Website development", amount: 120000 },
        ].map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-4">
            <span className="truncate text-zinc-600">{line.label}</span>
            <span className="tabular font-medium">{formatSample(line.amount, currency)}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3">
        <span className="text-sm font-medium text-zinc-600">Total due</span>
        <span className="tabular text-lg font-semibold">{formatSample(165000, currency)}</span>
      </div>
    </div>
  );
}
