import { and, asc, eq } from "drizzle-orm";
import { APP_NAME, DEFAULT_WA_CONTRACT_TEMPLATE } from "../../shared/constants";
import { contractReference, escapeHtml, sanitizeContractHtml } from "../../shared/contract";
import { SIGNATURE_MAX_BYTES } from "../../shared/schemas/contract";
import type { ContractDocument, ContractSignatureDTO } from "../../shared/types";
import type { Database } from "../db";
import { clients, contracts, files, projects, signatures } from "../db/schema";
import { sha256Hex } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { sniffImage } from "../lib/images";
import { cleanFileName } from "../lib/uploads";
import type { WorkspaceRow } from "../types";
import { logoUrlFromKey } from "./workspaces";

export type ContractRow = typeof contracts.$inferSelect;
export type SignatureRow = typeof signatures.$inferSelect;

const PNG_PREFIX = "data:image/png;base64,";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Decodes the signature a browser sent and makes sure it really is a PNG of a sensible size. */
export function parseSignatureImage(dataUrl: string): Uint8Array {
  const invalid = new ApiError(400, "invalid_signature", "That signature couldn't be read. Please sign again.", { signature: "Please sign again" });
  if (!dataUrl.startsWith(PNG_PREFIX)) throw invalid;
  let bytes: Uint8Array;
  try {
    const binary = atob(dataUrl.slice(PNG_PREFIX.length));
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw invalid;
  }
  if (bytes.byteLength < 100 || bytes.byteLength > SIGNATURE_MAX_BYTES) throw invalid;
  if (sniffImage(bytes)?.mime !== "image/png") throw invalid;
  return bytes;
}

export const signatureKey = (workspaceId: string, contractId: string, signatureId: string) => `ws/${workspaceId}/signatures/${contractId}/${signatureId}.png`;

export const contractMessageTemplate = (workspace: WorkspaceRow) => workspace.waContractTemplate ?? DEFAULT_WA_CONTRACT_TEMPLATE;

async function loadSignatures(db: Database, bucket: R2Bucket, contract: ContractRow): Promise<ContractSignatureDTO[]> {
  const rows = await db
    .select()
    .from(signatures)
    .where(and(eq(signatures.workspaceId, contract.workspaceId), eq(signatures.contractId, contract.id)))
    .orderBy(asc(signatures.signedAt));
  return Promise.all(
    rows.map(async (row): Promise<ContractSignatureDTO> => {
      const object = await bucket.get(row.signatureKey);
      const image = object ? `${PNG_PREFIX}${bytesToBase64(new Uint8Array(await object.arrayBuffer()))}` : "";
      return {
        role: row.signerRole,
        name: row.signerName,
        email: row.signerEmail,
        method: row.method,
        image,
        signedAt: row.signedAt.getTime(),
        ip: row.ip,
        userAgent: row.userAgent,
        contentHash: row.contentHash,
      };
    }),
  );
}

/**
 * Everything printed on a contract. Built the same way for the app and the public signing page, and
 * limited to what both parties are meant to see (no internal ids, notes or client contact numbers).
 */
export async function buildContractDocument(
  db: Database,
  bucket: R2Bucket,
  contract: ContractRow,
  workspace: WorkspaceRow,
): Promise<ContractDocument & { clientWhatsapp: string | null }> {
  // Every lookup is pinned to the contract's own workspace.
  const [clientRows, projectRows, signatureList, currentHash] = await Promise.all([
    contract.clientId
      ? db
          .select()
          .from(clients)
          .where(and(eq(clients.workspaceId, contract.workspaceId), eq(clients.id, contract.clientId)))
          .limit(1)
      : Promise.resolve([]),
    contract.projectId
      ? db
          .select({ title: projects.title })
          .from(projects)
          .where(and(eq(projects.workspaceId, contract.workspaceId), eq(projects.id, contract.projectId)))
          .limit(1)
      : Promise.resolve([]),
    loadSignatures(db, bucket, contract),
    contract.contentHash ?? sha256Hex(contract.content),
  ]);
  const client = clientRows[0];

  return {
    reference: contractReference(contract.id),
    title: contract.title,
    content: contract.content,
    status: contract.status,
    version: contract.version,
    contentHash: currentHash,
    agency: {
      name: workspace.name,
      logoUrl: logoUrlFromKey(workspace.logoKey),
      brandColor: workspace.brandColor,
      address: workspace.address,
      email: workspace.email,
      phone: workspace.phone,
    },
    client: { name: client?.name ?? "Client", company: client?.company ?? null, email: client?.email ?? null },
    projectTitle: projectRows[0]?.title ?? null,
    sentAt: contract.sentAt?.getTime() ?? null,
    viewedAt: contract.viewedAt?.getTime() ?? null,
    completedAt: contract.completedAt?.getTime() ?? null,
    signatures: signatureList,
    clientWhatsapp: client?.whatsapp ?? null,
  };
}

const utcStamp = (ms: number) => `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;

/**
 * The sealed copy: one self-contained HTML file (text, both signature images and the audit
 * certificate – no external requests) written to R2 the moment the contract is fully signed. It is
 * the record of what was agreed, independent of the live database row.
 */
function sealedHtml(doc: ContractDocument): string {
  const e = escapeHtml;
  const signatureBlocks = doc.signatures
    .map(
      (signature) => `
      <div class="sig">
        ${signature.image ? `<img src="${signature.image}" alt="Signature of ${e(signature.name)}">` : ""}
        <div class="line"></div>
        <strong>${e(signature.name)}</strong><br>
        <span>${signature.role === "client" ? `Client${doc.client.company ? ` · ${e(doc.client.company)}` : ""}` : `For ${e(doc.agency.name)}`}</span><br>
        <span>Signed ${utcStamp(signature.signedAt)}</span>
      </div>`,
    )
    .join("");
  const auditRows = doc.signatures
    .map(
      (signature) => `
      <tr><th colspan="2">${signature.role === "client" ? "Client" : "Agency"} signature</th></tr>
      <tr><td>Name</td><td>${e(signature.name)}</td></tr>
      <tr><td>Email</td><td>${e(signature.email ?? "Not provided")}</td></tr>
      <tr><td>Signed at</td><td>${utcStamp(signature.signedAt)}</td></tr>
      <tr><td>Method</td><td>${signature.method === "drawn" ? "Drawn signature" : "Typed signature"}</td></tr>
      <tr><td>IP address</td><td>${e(signature.ip ?? "Not recorded")}</td></tr>
      <tr><td>Device</td><td>${e(signature.userAgent ?? "Not recorded")}</td></tr>
      <tr><td>Document fingerprint</td><td class="mono">${e(signature.contentHash)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(doc.title)} – signed copy</title>
<style>
  body { font: 15px/1.65 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #18181b; background: #f4f4f5; margin: 0; padding: 24px; }
  main { max-width: 760px; margin: 0 auto; background: #fff; padding: 48px; border: 1px solid #e4e4e7; border-radius: 12px; }
  header { border-bottom: 2px solid ${e(doc.agency.brandColor)}; padding-bottom: 16px; margin-bottom: 28px; }
  header p { margin: 0; color: #71717a; font-size: 13px; }
  h1 { font-size: 24px; margin: 4px 0; }
  h2 { font-size: 19px; margin: 28px 0 8px; } h3 { font-size: 16px; margin: 22px 0 6px; } h4 { font-size: 15px; margin: 18px 0 4px; }
  p { margin: 0 0 12px; } ul, ol { margin: 0 0 12px; padding-left: 24px; } li p { margin: 0 0 4px; }
  blockquote { margin: 0 0 12px; padding-left: 14px; border-left: 3px solid #d4d4d8; color: #52525b; }
  hr { border: 0; border-top: 1px solid #e4e4e7; margin: 24px 0; }
  .sigs { display: flex; flex-wrap: wrap; gap: 32px; margin-top: 40px; page-break-inside: avoid; }
  .sig { flex: 1 1 240px; font-size: 13px; color: #52525b; } .sig strong { color: #18181b; font-size: 14px; }
  .sig img { display: block; height: 72px; max-width: 100%; object-fit: contain; object-position: left bottom; }
  .line { border-top: 1px solid #a1a1aa; margin: 4px 0 8px; }
  .cert { page-break-before: always; margin-top: 48px; padding-top: 32px; border-top: 1px solid #e4e4e7; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 16px 0 6px; font-size: 14px; }
  td { padding: 6px 0; border-top: 1px solid #f4f4f5; vertical-align: top; } td:first-child { width: 170px; color: #71717a; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
  .note { color: #71717a; font-size: 12px; margin-top: 20px; }
  @media print { body { background: #fff; padding: 0; } main { border: 0; padding: 0; max-width: none; } }
</style>
</head>
<body>
<main>
  <header>
    <p>${e(doc.agency.name)} · ${e(doc.reference)} · Version ${doc.version}</p>
    <h1>${e(doc.title)}</h1>
    <p>Between ${e(doc.agency.name)} and ${e(doc.client.name)}${doc.client.company ? `, ${e(doc.client.company)}` : ""}${doc.projectTitle ? ` · Project: ${e(doc.projectTitle)}` : ""}</p>
  </header>
  <article>${sanitizeContractHtml(doc.content)}</article>
  <section class="sigs">${signatureBlocks}</section>
  <section class="cert">
    <h2>Signature certificate</h2>
    <table>
      <tr><th colspan="2">Document</th></tr>
      <tr><td>Title</td><td>${e(doc.title)}</td></tr>
      <tr><td>Reference</td><td>${e(doc.reference)} · Version ${doc.version}</td></tr>
      <tr><td>Fingerprint (SHA-256)</td><td class="mono">${e(doc.contentHash)}</td></tr>
      ${doc.sentAt ? `<tr><td>Sent for signature</td><td>${utcStamp(doc.sentAt)}</td></tr>` : ""}
      ${doc.viewedAt ? `<tr><td>First opened by client</td><td>${utcStamp(doc.viewedAt)}</td></tr>` : ""}
      ${doc.completedAt ? `<tr><td>Completed</td><td>${utcStamp(doc.completedAt)}</td></tr>` : ""}
      ${auditRows}
    </table>
    <p class="note">The fingerprint is the SHA-256 hash of the agreement text at the moment it was signed. Both signatures were made against the same fingerprint. Signed electronically with ${APP_NAME}.</p>
  </section>
</main>
</body>
</html>`;
}

/** Writes the sealed copy to R2, records it as a file and links it to the contract. Returns the file id. */
export async function sealContract(db: Database, bucket: R2Bucket, contract: ContractRow, workspace: WorkspaceRow, uploadedBy: string | null): Promise<string> {
  const { clientWhatsapp: _omit, ...document } = await buildContractDocument(db, bucket, contract, workspace);
  const bytes = new TextEncoder().encode(sealedHtml(document));
  const key = `ws/${contract.workspaceId}/contracts/${contract.id}/signed-v${contract.version}.html`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: "text/html; charset=utf-8" } });

  const [file] = await db
    .insert(files)
    .values({
      workspaceId: contract.workspaceId,
      projectId: contract.projectId,
      kind: "signed_contract",
      r2Key: key,
      name: `${cleanFileName(contract.title, "Contract")} - signed.html`,
      contentType: "text/html; charset=utf-8",
      size: bytes.byteLength,
      uploadedBy,
    })
    // A retry after a half-finished attempt reuses the file row that already points at this object.
    .onConflictDoUpdate({ target: files.r2Key, set: { size: bytes.byteLength, deletedAt: null } })
    .returning({ id: files.id });
  if (!file) throw new Error("Insert returned no row");
  await db
    .update(contracts)
    .set({ signedPdfFileId: file.id })
    .where(and(eq(contracts.workspaceId, contract.workspaceId), eq(contracts.id, contract.id)));
  return file.id;
}
