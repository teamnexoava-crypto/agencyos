import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "../../shared/schemas/common";
import { clientSignSchema } from "../../shared/schemas/contract";
import { portalCommentSchema } from "../../shared/schemas/portal";
import type { CommentDTO, ContractDocument, InvoiceDocument, PortalData } from "../../shared/types";
import type { Database } from "../db";
import { activityLog, comments, contracts, files, invoices, signatures, workspaces } from "../db/schema";
import { sha256Hex } from "../lib/crypto";
import { ApiError, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { clientIp, userAgent } from "../lib/request";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { buildContractDocument, parseSignatureImage, signatureKey, type ContractRow } from "../services/contracts";
import { buildInvoiceDocument, notifyManagers } from "../services/invoices";
import { buildPortalData, findPortal, recordPortalView, toCommentDTO } from "../services/portal";
import { hasFeature } from "../services/billing";
import type { AppEnv, WorkspaceRow } from "../types";

/**
 * Resolves a client portal link. The portal is a paid feature: while the workspace is on the Free
 * tier its links answer as if they did not exist, and work again the moment it upgrades.
 */
async function openPortal(c: Context<AppEnv>, token: string) {
  const portal = await findPortal(c.var.db, token);
  if (!hasFeature(c.env, portal.workspace, "portal")) throw notFound("Page");
  return portal;
}


const tokenParam = z.object({ token: z.string().regex(/^[\w-]{21,64}$/) });

/** A contract by its public link, with its workspace. Drafts behave as if the link doesn't exist. */
async function findContract(db: Database, token: string) {
  const [row] = await db
    .select({ contract: contracts, workspace: workspaces })
    .from(contracts)
    .innerJoin(workspaces, eq(workspaces.id, contracts.workspaceId))
    .where(and(eq(contracts.publicToken, token), isNull(contracts.deletedAt), isNull(workspaces.deletedAt)))
    .limit(1);
  if (!row || row.contract.status === "draft") throw notFound("Contract");
  return row;
}

/** "r***@gmail.com" – enough to recognise, not enough to copy. */
const maskEmail = (email: string | null) => {
  if (!email) return null;
  const [user = "", domain = ""] = email.split("@");
  return domain ? `${user.slice(0, 1)}***@${domain}` : "***";
};

/** "203.0.113.x" or "2001:db8:85a3:…" – the network, not the exact address. */
const maskIp = (ip: string | null) => {
  if (!ip) return null;
  if (ip.includes(".")) return ip.split(".").slice(0, 3).concat("x").join(".");
  return `${ip.split(":").slice(0, 3).join(":")}:…`;
};

/** "Chrome on Android" instead of the full browser string. */
function deviceSummary(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? "Edge" : /OPR\/|Opera/.test(userAgent) ? "Opera" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "A browser";
  const system = /Android/.test(userAgent) ? "Android" : /iPhone|iPad|iPod/.test(userAgent) ? "iOS" : /Windows/.test(userAgent) ? "Windows" : /Mac OS X|Macintosh/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "another system";
  return `${browser} on ${system}`;
}

/**
 * The contract as shown on the public page – anyone holding the link can see it, so: no contact
 * details beyond what is printed on the document itself, and the signers' email, IP address and device
 * only in part. The agency sees them in full inside the app.
 */
async function publicContractDocument(db: Database, bucket: R2Bucket, contract: ContractRow, workspace: WorkspaceRow): Promise<ContractDocument> {
  const { clientWhatsapp: _omit, ...document } = await buildContractDocument(db, bucket, contract, workspace);
  return {
    ...document,
    client: { ...document.client, email: null },
    signatures: document.signatures.map((signature) => ({ ...signature, email: maskEmail(signature.email), ip: maskIp(signature.ip), userAgent: deviceSummary(signature.userAgent) })),
  };
}

/**
 * Public, login-free pages reached through unguessable links (/i/:token, /c/:token; the client
 * portal later). These routes are NOT tenant-scoped by a session – the token is the key – so
 * each one returns a hand-picked set of client-safe fields and all of them are rate-limited.
 */
export const publicRoutes = new Hono<AppEnv>()
  .use(rateLimit("PUBLIC_LIMITER"))

  .get("/invoices/:token", validate("param", tokenParam), async (c) => {
    const db = c.var.db;
    const [row] = await db
      .select({ invoice: invoices, workspace: workspaces })
      .from(invoices)
      .innerJoin(workspaces, eq(workspaces.id, invoices.workspaceId))
      .where(and(eq(invoices.publicToken, c.req.valid("param").token), isNull(invoices.deletedAt), isNull(workspaces.deletedAt)))
      .limit(1);
    // Drafts are not public yet: until the agency sends it, the link behaves as if it doesn't exist.
    if (!row || row.invoice.status === "draft") throw notFound("Invoice");
    let { invoice } = row;
    const { workspace } = row;

    // First open by someone outside the agency → mark as viewed and tell the owners/admins.
    const viewerIsTeam = c.var.auth?.workspace?.id === invoice.workspaceId;
    if (!viewerIsTeam && invoice.viewedAt === null && invoice.status !== "cancelled") {
      const [updated] = await db
        .update(invoices)
        .set({ viewedAt: new Date(), ...(invoice.status === "sent" && { status: "viewed" as const }) })
        .where(and(eq(invoices.id, invoice.id), isNull(invoices.viewedAt)))
        .returning();
      if (updated) {
        invoice = updated;
        c.var.defer(
          Promise.all([
            db.insert(activityLog).values({
              workspaceId: invoice.workspaceId,
              type: "invoice.viewed",
              actorName: "Client",
              entityType: "invoice",
              entityId: invoice.id,
              projectId: invoice.projectId,
              summary: `Invoice ${invoice.number} was viewed by the client`,
              financeOnly: true,
            }),
            notifyManagers(db, invoice.workspaceId, {
              type: "invoice.viewed",
              title: `Invoice ${invoice.number} was viewed`,
              body: "Your client opened the invoice link.",
              link: `/app/invoices/${invoice.id}`,
            }),
          ]),
        );
      }
    }

    // `clientWhatsapp` is for the agency's share button only – never sent to the public page.
    const { clientWhatsapp: _omit, ...document } = await buildInvoiceDocument(db, invoice, workspace);
    // Line items are numbered for the page; their database ids stay private.
    const body: { invoice: InvoiceDocument } = { invoice: { ...document, items: document.items.map((item, index) => ({ ...item, id: String(index + 1) })) } };
    return c.json(body);
  })

  .get("/contracts/:token", validate("param", tokenParam), async (c) => {
    const db = c.var.db;
    const found = await findContract(db, c.req.valid("param").token);
    let { contract } = found;

    // First open by someone outside the agency → mark as viewed and tell the owners/admins.
    const viewerIsTeam = c.var.auth?.workspace?.id === contract.workspaceId;
    if (!viewerIsTeam && contract.status === "sent") {
      const [updated] = await db
        .update(contracts)
        .set({ status: "viewed", viewedAt: new Date() })
        .where(and(eq(contracts.id, contract.id), eq(contracts.status, "sent")))
        .returning();
      if (updated) {
        contract = updated;
        c.var.defer(
          Promise.all([
            db.insert(activityLog).values({
              workspaceId: contract.workspaceId,
              type: "contract.viewed",
              actorName: "Client",
              entityType: "contract",
              entityId: contract.id,
              projectId: contract.projectId,
              summary: `The contract "${contract.title}" was opened by the client`,
              financeOnly: true,
            }),
            notifyManagers(db, contract.workspaceId, {
              type: "contract.viewed",
              title: `"${contract.title}" was opened`,
              body: "Your client opened the contract link.",
              link: `/app/contracts/${contract.id}`,
            }),
          ]),
        );
      }
    }

    const document = await publicContractDocument(db, c.env.BUCKET, contract, found.workspace);
    // A withdrawn contract shows that it was withdrawn – not its text.
    const body: { contract: ContractDocument } = { contract: contract.status === "voided" ? { ...document, content: "", signatures: [] } : document };
    return c.json(body);
  })

  /** The client signs. Tighter limit than page views: this writes to storage. */
  .post(
    "/contracts/:token/sign",
    rateLimit("AUTH_LIMITER"),
    validate("param", tokenParam),
    bodyLimit({ maxSize: 512 * 1024 }),
    validate("json", clientSignSchema),
    async (c) => {
      const db = c.var.db;
      const { token } = c.req.valid("param");
      const input = c.req.valid("json");
      const { contract, workspace } = await findContract(db, token);
      const changed = new ApiError(409, "conflict", "This contract was updated or already signed. Reload the page to see the latest version.");
      if (contract.status !== "sent" && contract.status !== "viewed") throw changed;
      // The signer must have been looking at exactly the text that is about to be locked.
      if ((await sha256Hex(contract.content)) !== input.contentHash) throw changed;
      const image = parseSignatureImage(input.signature);

      const signatureId = newId();
      const key = signatureKey(contract.workspaceId, contract.id, signatureId);
      await c.env.BUCKET.put(key, image, { httpMetadata: { contentType: "image/png" } });

      const signedAt = new Date();
      let signed;
      try {
        signed = await db.transaction(async (tx) => {
          const [locked] = await tx
            .select()
            .from(contracts)
            .where(and(eq(contracts.id, contract.id), eq(contracts.publicToken, token), isNull(contracts.deletedAt)))
            .for("update");
          if (!locked || (locked.status !== "sent" && locked.status !== "viewed") || locked.content !== contract.content) throw changed;

          await tx.insert(signatures).values({
            id: signatureId,
            workspaceId: locked.workspaceId,
            contractId: locked.id,
            signerRole: "client",
            signerName: input.name,
            signerEmail: input.email || null,
            method: input.method,
            signatureKey: key,
            ip: clientIp(c),
            userAgent: userAgent(c),
            contentHash: input.contentHash,
            signedAt,
          });
          const [row] = await tx
            .update(contracts)
            .set({ status: "client_signed", clientSignedAt: signedAt, lockedAt: signedAt, contentHash: input.contentHash, viewedAt: locked.viewedAt ?? signedAt, updatedAt: signedAt })
            .where(eq(contracts.id, locked.id))
            .returning();
          if (!row) throw new Error("Update returned no row");
          return row;
        });
      } catch (error) {
        c.var.defer(c.env.BUCKET.delete(key));
        throw error;
      }

      c.var.defer(
        Promise.all([
          db.insert(activityLog).values({
            workspaceId: signed.workspaceId,
            type: "contract.signed",
            actorName: input.name,
            entityType: "contract",
            entityId: signed.id,
            projectId: signed.projectId,
            summary: `${input.name} signed the contract "${signed.title}"`,
            financeOnly: true,
          }),
          notifyManagers(db, signed.workspaceId, {
            type: "contract.signed",
            title: `${input.name} signed "${signed.title}"`,
            body: "Add your counter-signature to complete it.",
            link: `/app/contracts/${signed.id}`,
          }),
        ]),
      );

      const body: { contract: ContractDocument } = { contract: await publicContractDocument(db, c.env.BUCKET, signed, workspace) };
      return c.json(body);
    },
  )

  /* ---------------------------------------------------------------- client portal (/p/:token) */

  .get("/portal/:token", validate("param", tokenParam), async (c) => {
    const db = c.var.db;
    const portal = await openPortal(c, c.req.valid("param").token);
    const viewerIsTeam = c.var.auth?.workspace?.id === portal.link.workspaceId;
    // The page re-fetches quietly while it stays open (`?refresh=1`); only the first load is a visit.
    if (!viewerIsTeam && c.req.query("refresh") !== "1") c.var.defer(recordPortalView(db, portal.link));
    const body: { portal: PortalData } = { portal: await buildPortalData(db, portal) };
    return c.json(body);
  })

  /** Download of a file the agency has explicitly shared on this project's portal. */
  .get("/portal/:token/files/:fileId", validate("param", tokenParam.extend({ fileId: idSchema })), async (c) => {
    const db = c.var.db;
    const { token, fileId } = c.req.valid("param");
    const { link, project } = await openPortal(c, token);
    if (!link.showFiles) throw notFound("File");
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.workspaceId, link.workspaceId),
          eq(files.projectId, project.id),
          eq(files.kind, "project_file"),
          eq(files.sharedWithClient, true),
          isNull(files.deletedAt),
        ),
      )
      .limit(1);
    if (!file) throw notFound("File");
    const object = await c.env.BUCKET.get(file.r2Key);
    if (!object) throw notFound("File");

    const inline = file.contentType.startsWith("image/") || file.contentType === "application/pdf";
    return new Response(object.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(object.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  })

  /** A message from the client. Tighter limit than page views: this writes to the database and notifies people. */
  .post("/portal/:token/comments", rateLimit("AUTH_LIMITER"), validate("param", tokenParam), validate("json", portalCommentSchema), async (c) => {
    const db = c.var.db;
    const { link, project } = await openPortal(c, c.req.valid("param").token);
    if (!link.allowComments) throw new ApiError(403, "comments_off", "Messages are switched off for this project.");
    const input = c.req.valid("json");
    const [row] = await db
      .insert(comments)
      .values({ workspaceId: link.workspaceId, projectId: project.id, authorType: "client", authorName: input.name, body: input.body })
      .returning();
    if (!row) throw new Error("Insert returned no row");

    c.var.defer(
      Promise.all([
        db.insert(activityLog).values({
          workspaceId: link.workspaceId,
          type: "comment.created",
          actorName: input.name,
          entityType: "project",
          entityId: project.id,
          projectId: project.id,
          summary: `${input.name} left a message on ${project.title}`,
        }),
        notifyManagers(db, link.workspaceId, {
          type: "comment.created",
          title: `New message on ${project.title}`,
          body: `${input.name}: ${input.body.slice(0, 140)}`,
          link: `/app/projects/${project.id}?tab=client-link`,
        }),
      ]),
    );
    const body: { comment: CommentDTO } = { comment: toCommentDTO(row) };
    return c.json(body, 201);
  });
