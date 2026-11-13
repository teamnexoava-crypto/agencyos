import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import type { ContractDocument as ContractDocumentData, ContractSignatureDTO } from "@shared/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatSignedAt } from "./meta";

function SignatureBlock({ label, sublabel, signature }: { label: string; sublabel: string; signature?: ContractSignatureDTO }) {
  return (
    <div className="min-w-0 break-inside-avoid">
      <p className="mb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{label}</p>
      <div className={cn("flex h-24 items-end", !signature && "rounded-lg border border-dashed border-zinc-300 bg-zinc-50")}>
        {signature ? (
          signature.image && <img src={signature.image} alt={`Signature of ${signature.name}`} className="max-h-full max-w-full object-contain object-left-bottom" />
        ) : (
          <span className="m-auto text-xs text-zinc-400">Awaiting signature</span>
        )}
      </div>
      <div className="mt-1 border-t border-zinc-400 pt-2">
        <p className="font-semibold text-zinc-900">{signature?.name ?? " "}</p>
        <p className="text-zinc-500">{sublabel}</p>
        {signature && <p className="text-xs text-zinc-500">Signed {formatSignedAt(signature.signedAt)}</p>}
      </div>
    </div>
  );
}

function CertificateRow({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-x-4 border-t border-zinc-100 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] print:grid-cols-[11rem_minmax(0,1fr)] print:py-1.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={cn("min-w-0 text-zinc-900", mono && "font-mono text-[11px] break-all")}>{children}</dd>
    </div>
  );
}

interface ContractDocumentProps {
  contract: ContractDocumentData;
  className?: string;
}

/**
 * The agreement as both parties see it: used on the contract page, the public /c/:token page and –
 * through the print stylesheet – the PDF. Always light "paper". Once anyone has signed, a signature
 * certificate with the audit trail follows on its own page.
 */
export function ContractDocument({ contract, className }: ContractDocumentProps) {
  const accent = contract.agency.brandColor;
  const clientSignature = contract.signatures.find((signature) => signature.role === "client");
  const agencySignature = contract.signatures.find((signature) => signature.role === "agency");

  return (
    <article
      className={cn("print-area relative overflow-hidden rounded-2xl border border-zinc-200 bg-white text-[13px] leading-relaxed text-zinc-800 shadow-lift [color-scheme:light]", className)}
      aria-label={contract.title}
    >
      <div aria-hidden="true" className="h-1.5 w-full print:h-1" style={{ backgroundColor: accent }} />

      <div className="p-6 sm:p-10 print:p-0 print:pt-6">
        <header className="flex flex-col gap-5 border-b border-zinc-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            {contract.agency.logoUrl ? (
              <img src={contract.agency.logoUrl} alt="" className="size-12 shrink-0 rounded-xl border border-zinc-200 bg-white object-contain" />
            ) : (
              <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white" style={{ backgroundColor: accent }}>
                {initials(contract.agency.name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-base leading-tight font-semibold text-zinc-900">{contract.agency.name}</p>
              <p className="mt-0.5 text-zinc-500">{[contract.agency.phone, contract.agency.email].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <dl className="shrink-0 text-zinc-500 sm:text-right">
            <dt className="sr-only">Reference</dt>
            <dd className="tabular font-medium" style={{ color: accent }}>
              {contract.reference}
              {contract.version > 1 && ` · v${contract.version}`}
            </dd>
            <dt className="sr-only">Prepared for</dt>
            <dd>
              Prepared for <span className="font-medium text-zinc-900">{contract.client.name}</span>
            </dd>
            {contract.client.company && <dd>{contract.client.company}</dd>}
          </dl>
        </header>

        <h2 className="mt-8 text-2xl font-semibold tracking-tight text-zinc-900">{contract.title}</h2>
        {contract.projectTitle && <p className="mt-1 text-zinc-500">Project: {contract.projectTitle}</p>}

        {/* The HTML is rebuilt from an allow-list on the server (shared/contract.ts) – tags only, no attributes. */}
        <div className="contract-prose mt-6" dangerouslySetInnerHTML={{ __html: contract.content }} />

        <section aria-label="Signatures" className="mt-12 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
          <SignatureBlock label="Client" sublabel={[contract.client.name, contract.client.company].filter(Boolean).join(" · ")} signature={clientSignature} />
          <SignatureBlock label="Agency" sublabel={`For ${contract.agency.name}`} signature={agencySignature} />
        </section>

        {contract.signatures.length > 0 && (
          <section aria-labelledby="certificate-heading" className="mt-12 border-t border-zinc-200 pt-8 print:mt-0 print:break-before-page print:border-0 print:pt-0">
            <h2 id="certificate-heading" className="flex items-center gap-2 text-base font-semibold text-zinc-900">
              <ShieldCheck className="size-4.5" style={{ color: accent }} /> Signature certificate
            </h2>
            <p className="mt-1 text-zinc-500">A record of who signed this document, when, and from where.</p>

            <dl className="mt-5">
              <p className="pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">Document</p>
              <CertificateRow label="Title">{contract.title}</CertificateRow>
              <CertificateRow label="Reference">
                {contract.reference} · Version {contract.version}
              </CertificateRow>
              <CertificateRow label="Fingerprint (SHA-256)" mono>
                {contract.contentHash}
              </CertificateRow>
              {contract.sentAt && <CertificateRow label="Sent for signature">{formatSignedAt(contract.sentAt)}</CertificateRow>}
              {contract.viewedAt && <CertificateRow label="First opened by client">{formatSignedAt(contract.viewedAt)}</CertificateRow>}
              {contract.completedAt && <CertificateRow label="Completed">{formatSignedAt(contract.completedAt)}</CertificateRow>}
            </dl>

            {contract.signatures.map((signature) => (
              <dl key={`${signature.role}-${signature.signedAt}`} className="mt-6 break-inside-avoid print:mt-4">
                <p className="pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{signature.role === "client" ? "Client signature" : "Agency signature"}</p>
                <CertificateRow label="Name">{signature.name}</CertificateRow>
                <CertificateRow label="Email">{signature.email ?? "Not provided"}</CertificateRow>
                <CertificateRow label="Signed at">{formatSignedAt(signature.signedAt)}</CertificateRow>
                <CertificateRow label="Method">{signature.method === "drawn" ? "Drawn signature" : "Typed signature"}</CertificateRow>
                <CertificateRow label="IP address">{signature.ip ?? "Not recorded"}</CertificateRow>
                <CertificateRow label="Device">
                  <span className="text-xs break-words">{signature.userAgent ?? "Not recorded"}</span>
                </CertificateRow>
                <CertificateRow label="Document fingerprint" mono>
                  {signature.contentHash}
                </CertificateRow>
              </dl>
            ))}
            <p className="mt-5 text-xs text-zinc-500 print:mt-3">
              The fingerprint is the SHA-256 hash of the agreement text at the moment it was signed. Matching fingerprints mean every party signed exactly the same text.
            </p>
          </section>
        )}
      </div>
    </article>
  );
}
