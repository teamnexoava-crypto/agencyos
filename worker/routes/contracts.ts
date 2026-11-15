import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { contractText, fillContractVariables, sanitizeContractHtml } from "../../shared/contract";
import { idSchema } from "../../shared/schemas/common";
import { agencySignSchema, contractCreateSchema, contractTemplateSchema, contractUpdateSchema } from "../../shared/schemas/contract";
import type { ContractDetail, ContractListItem, ContractTemplateDTO } from "../../shared/types";
import { clients, contractTemplates, contracts, projects, signatures } from "../db/schema";
import { sha256Hex } from "../lib/crypto";
import { ApiError, notFound } from "../lib/errors";
import { newId, newPublicToken } from "../lib/ids";
import { clientIp, localToday, userAgent } from "../lib/request";
import { tenant, type Tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { logActivity } from "../services/activity";
import { assertContractAvailable, assertFeature } from "../services/billing";
import { buildContractDocument, contractMessageTemplate, parseSignatureImage, sealContract, signatureKey, type ContractRow } from "../services/contracts";
import { notifyManagers } from "../services/invoices";
import { requireClientId, requireProject } from "../services/projects";
import type { AppEnv } from "../types";
import { formatIndianDate } from "../../shared/dates";

const idParam = z.object({ id: idSchema });
const listQuery = z.object({ clientId: idSchema.optional(), projectId: idSchema.optional() });
const conflict = (message: string) => new ApiError(409, "conflict", message);

const longDate = (iso: string) => formatIndianDate(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

type TemplateRow = typeof contractTemplates.$inferSelect;
const toTemplateDTO = (row: TemplateRow): ContractTemplateDTO => ({ id: row.id, name: row.name, content: row.content, updatedAt: row.updatedAt.getTime() });

async function requireContract(t: Tenant, id: string): Promise<ContractRow> {
  const [row] = await t.db
    .select()
    .from(contracts)
    .where(t.where(contracts, eq(contracts.id, id), isNull(contracts.deletedAt)))
    .limit(1);
  if (!row) throw notFound("Contract");
  return row;
}

async function requireTemplate(t: Tenant, id: string): Promise<TemplateRow> {
  const [row] = await t.db
    .select()
    .from(contractTemplates)
    .where(t.where(contractTemplates, eq(contractTemplates.id, id), isNull(contractTemplates.deletedAt)))
    .limit(1);
  if (!row) throw notFound("Template");
  return row;
}

async function loadDetail(t: Tenant, bucket: R2Bucket, contract: ContractRow): Promise<ContractDetail> {
  const [document, newer] = await Promise.all([
    buildContractDocument(t.db, bucket, contract, t.workspace),
    t.db
      .select({ id: contracts.id })
      .from(contracts)
      .where(t.where(contracts, eq(contracts.previousVersionId, contract.id), isNull(contracts.deletedAt)))
      .orderBy(desc(contracts.createdAt))
      .limit(1),
  ]);
  return {
    ...document,
    id: contract.id,
    clientId: contract.clientId,
    projectId: contract.projectId,
    publicToken: contract.publicToken,
    createdAt: contract.createdAt.getTime(),
    updatedAt: contract.updatedAt.getTime(),
    nextVersionId: newer[0]?.id ?? null,
    previousVersionId: contract.previousVersionId,
    signedFileId: contract.signedPdfFileId,
    messageTemplate: contractMessageTemplate(t.workspace),
  };
}

/** Changes status only if the contract is still in one of the expected states (guards against double clicks and races). */
async function transition(t: Tenant, contract: ContractRow, from: ContractRow["status"][], values: Partial<typeof contracts.$inferInsert>): Promise<ContractRow> {
  if (!from.includes(contract.status)) throw conflict("This contract has changed. Refresh the page and try again.");
  const [updated] = await t.db
    .update(contracts)
    .set({ ...values, updatedAt: new Date() })
    .where(t.where(contracts, eq(contracts.id, contract.id), eq(contracts.status, contract.status)))
    .returning();
  if (!updated) throw conflict("This contract has changed. Refresh the page and try again.");
  return updated;
}

/** Contracts carry fees and legal terms: owner and admin only. */
export const contractRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .use(async (c, next) => {
    tenant(c).requireRole("owner", "admin");
    await next();
  })

  .get("/", validate("query", listQuery), async (c) => {
    const t = tenant(c);
    const filter = c.req.valid("query");
    const rows = await t.db
      .select({ contract: contracts, clientName: clients.name, projectTitle: projects.title })
      .from(contracts)
      .leftJoin(clients, eq(clients.id, contracts.clientId))
      .leftJoin(projects, eq(projects.id, contracts.projectId))
      .where(
        t.where(
          contracts,
          isNull(contracts.deletedAt),
          filter.clientId ? eq(contracts.clientId, filter.clientId) : undefined,
          filter.projectId ? eq(contracts.projectId, filter.projectId) : undefined,
        ),
      )
      .orderBy(desc(contracts.updatedAt))
      .limit(1000);
    const list: ContractListItem[] = rows.map(({ contract, clientName, projectTitle }) => ({
      id: contract.id,
      title: contract.title,
      status: contract.status,
      version: contract.version,
      clientId: contract.clientId,
      clientName,
      projectId: contract.projectId,
      projectTitle,
      sentAt: contract.sentAt?.getTime() ?? null,
      completedAt: contract.completedAt?.getTime() ?? null,
      updatedAt: contract.updatedAt.getTime(),
    }));
    return c.json({ contracts: list });
  })

  /* ---------------------------------------------------------------------------------------------
   * Templates
   * ------------------------------------------------------------------------------------------- */

  .get("/templates", async (c) => {
    const t = tenant(c);
    const rows = await t.db
      .select()
      .from(contractTemplates)
      .where(t.where(contractTemplates, isNull(contractTemplates.deletedAt)))
      .orderBy(desc(contractTemplates.updatedAt));
    return c.json({ templates: rows.map(toTemplateDTO) });
  })

  .post("/templates", validate("json", contractTemplateSchema), async (c) => {
    const t = tenant(c);
    assertFeature(t, c.env, "contracts");
    const input = c.req.valid("json");
    const [row] = await t.db
      .insert(contractTemplates)
      .values({ workspaceId: t.workspaceId, name: input.name, content: sanitizeContractHtml(input.content) })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    return c.json({ template: toTemplateDTO(row) }, 201);
  })

  .put("/templates/:id", validate("param", idParam), validate("json", contractTemplateSchema), async (c) => {
    const t = tenant(c);
    assertFeature(t, c.env, "contracts");
    const existing = await requireTemplate(t, c.req.valid("param").id);
    const input = c.req.valid("json");
    const [row] = await t.db
      .update(contractTemplates)
      .set({ name: input.name, content: sanitizeContractHtml(input.content), updatedAt: new Date() })
      .where(t.where(contractTemplates, eq(contractTemplates.id, existing.id)))
      .returning();
    if (!row) throw notFound("Template");
    return c.json({ template: toTemplateDTO(row) });
  })

  .delete("/templates/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const existing = await requireTemplate(t, c.req.valid("param").id);
    // Contracts already made from it keep their own copy of the text.
    await t.db
      .update(contractTemplates)
      .set({ deletedAt: new Date() })
      .where(t.where(contractTemplates, eq(contractTemplates.id, existing.id)));
    return c.json({ ok: true });
  })

  /* ---------------------------------------------------------------------------------------------
   * Contracts
   * ------------------------------------------------------------------------------------------- */

  .post("/", validate("json", contractCreateSchema), async (c) => {
    const t = tenant(c);
    const input = c.req.valid("json");
    await assertContractAvailable(t, c.env);

    const project = input.projectId ? await requireProject(t, input.projectId) : null;
    const clientId = input.clientId || project?.clientId || "";
    if (!clientId) throw new ApiError(400, "validation_error", "Choose who this contract is for.", { clientId: "Choose a client" });
    await requireClientId(t, clientId);
    if (project?.clientId && project.clientId !== clientId) {
      throw new ApiError(400, "validation_error", "That project belongs to a different client.", { projectId: "This project belongs to a different client" });
    }
    const [client] = await t.db
      .select()
      .from(clients)
      .where(t.where(clients, eq(clients.id, clientId)))
      .limit(1);
    const template = input.templateId ? await requireTemplate(t, input.templateId) : null;

    const content = template
      ? fillContractVariables(sanitizeContractHtml(template.content), {
          client_name: client?.name ?? "",
          client_company: client?.company ?? "",
          project_title: project?.title ?? "",
          amount: project && project.budget > 0 ? money(project.budget, t.workspace.currency) : "",
          start_date: project?.startDate ? longDate(project.startDate) : "",
          due_date: project?.dueDate ? longDate(project.dueDate) : "",
          agency_name: t.workspace.name,
          today: longDate(localToday(c)),
        })
      : "";

    const [row] = await t.db
      .insert(contracts)
      .values({
        workspaceId: t.workspaceId,
        clientId,
        projectId: project?.id ?? null,
        templateId: template?.id ?? null,
        title: input.title,
        content,
        publicToken: newPublicToken(),
        createdBy: t.member.id,
      })
      .returning();
    if (!row) throw new Error("Insert returned no row");

    c.var.defer(
      logActivity(t, { type: "contract.created", summary: `${t.user.name} drafted the contract "${row.title}"`, entityType: "contract", entityId: row.id, projectId: row.projectId, financeOnly: true }),
    );
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, row) }, 201);
  })

  .get("/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    let contract = await requireContract(t, c.req.valid("param").id);
    // If writing the sealed copy failed at signing time (a storage hiccup), make it now.
    if (contract.status === "completed" && contract.signedPdfFileId === null) {
      try {
        contract = { ...contract, signedPdfFileId: await sealContract(t.db, c.env.BUCKET, contract, t.workspace, t.member.id) };
      } catch (error) {
        console.error("Failed to write the sealed contract copy", error);
      }
    }
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, contract) });
  })

  /** Text can only change while the contract is a draft – once it is out for signature it is frozen. */
  .put("/:id", validate("param", idParam), bodyLimit({ maxSize: 512 * 1024 }), validate("json", contractUpdateSchema), async (c) => {
    const t = tenant(c);
    const contract = await requireContract(t, c.req.valid("param").id);
    const input = c.req.valid("json");
    const updated = await transition(t, contract, ["draft"], { title: input.title, content: sanitizeContractHtml(input.content) });
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, updated) });
  })

  .post("/:id/send", validate("param", idParam), async (c) => {
    const t = tenant(c);
    assertFeature(t, c.env, "contracts");
    const contract = await requireContract(t, c.req.valid("param").id);
    if (contract.status !== "draft") return c.json({ contract: await loadDetail(t, c.env.BUCKET, contract) }); // already sent: nothing to do
    if (contractText(contract.content).length === 0) throw new ApiError(400, "empty_contract", "Write the agreement text before sending it.");
    const updated = await transition(t, contract, ["draft"], { status: "sent", sentAt: new Date(), viewedAt: null });
    c.var.defer(
      logActivity(t, { type: "contract.sent", summary: `${t.user.name} sent the contract "${updated.title}" for signature`, entityType: "contract", entityId: updated.id, projectId: updated.projectId, financeOnly: true }),
    );
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, updated) });
  })

  /** Pull an unsigned contract back to edit it. The client's link stops working until it is sent again. */
  .post("/:id/unsend", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const contract = await requireContract(t, c.req.valid("param").id);
    const updated = await transition(t, contract, ["sent", "viewed"], { status: "draft", sentAt: null, viewedAt: null });
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, updated) });
  })

  .post("/:id/void", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const contract = await requireContract(t, c.req.valid("param").id);
    const updated = await transition(t, contract, ["sent", "viewed", "client_signed"], { status: "voided" });
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, updated) });
  })

  /** New public link; the old one stops working at once. */
  .post("/:id/link", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const contract = await requireContract(t, c.req.valid("param").id);
    const updated = await transition(t, contract, ["sent", "viewed", "client_signed", "completed"], { publicToken: newPublicToken() });
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, updated) });
  })

  /** Agency counter-signature. Completes the contract and writes the sealed copy. */
  .post("/:id/sign", validate("param", idParam), bodyLimit({ maxSize: 512 * 1024 }), validate("json", agencySignSchema), async (c) => {
    const t = tenant(c);
    const contract = await requireContract(t, c.req.valid("param").id);
    const input = c.req.valid("json");
    if (contract.status !== "client_signed") throw conflict("The client needs to sign first.");
    const image = parseSignatureImage(input.signature);

    const signatureId = newId();
    const key = signatureKey(t.workspaceId, contract.id, signatureId);
    await c.env.BUCKET.put(key, image, { httpMetadata: { contentType: "image/png" } });

    const signedAt = new Date();
    let completed: ContractRow;
    try {
      completed = await t.db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(contracts)
          .where(t.where(contracts, eq(contracts.id, contract.id), isNull(contracts.deletedAt)))
          .for("update");
        if (!locked || locked.status !== "client_signed") throw conflict("This contract has changed. Refresh the page and try again.");
        // Both signatures must be over the very same text.
        const hash = await sha256Hex(locked.content);
        if (locked.contentHash !== hash) throw conflict("The contract text no longer matches what the client signed. Create a new version instead.");

        await tx.insert(signatures).values({
          id: signatureId,
          workspaceId: t.workspaceId,
          contractId: locked.id,
          signerRole: "agency",
          signerName: input.name,
          signerEmail: t.user.email,
          signerUserId: t.user.id,
          method: input.method,
          signatureKey: key,
          ip: clientIp(c),
          userAgent: userAgent(c),
          contentHash: hash,
          signedAt,
        });
        const [row] = await tx
          .update(contracts)
          .set({ status: "completed", completedAt: signedAt, updatedAt: signedAt })
          .where(and(eq(contracts.id, locked.id), eq(contracts.workspaceId, t.workspaceId)))
          .returning();
        if (!row) throw new Error("Update returned no row");
        return row;
      });
    } catch (error) {
      c.var.defer(c.env.BUCKET.delete(key));
      throw error;
    }

    try {
      completed = { ...completed, signedPdfFileId: await sealContract(t.db, c.env.BUCKET, completed, t.workspace, t.member.id) };
    } catch (error) {
      // The signatures are safely recorded; a missing sealed copy must not undo the signing.
      console.error("Failed to write the sealed contract copy", error);
    }

    c.var.defer(
      Promise.all([
        logActivity(t, { type: "contract.signed", summary: `"${completed.title}" is fully signed`, entityType: "contract", entityId: completed.id, projectId: completed.projectId, financeOnly: true }),
        notifyManagers(t.db, t.workspaceId, { type: "contract.signed", title: `"${completed.title}" is fully signed`, body: `${input.name} counter-signed. The signed copy is ready.`, link: `/app/contracts/${completed.id}` }, t.user.id),
      ]),
    );
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, completed) });
  })

  /**
   * A contract that is out for signature or signed can never be edited. To change it, a new draft is
   * made from its text; an unfinished original is voided so two live versions can't both be signed.
   */
  .post("/:id/version", validate("param", idParam), async (c) => {
    const t = tenant(c);
    assertFeature(t, c.env, "contracts");
    const contract = await requireContract(t, c.req.valid("param").id);
    if (contract.status === "draft") throw conflict("This contract is still a draft – you can edit it directly.");
    const [existing] = await t.db
      .select({ id: contracts.id })
      .from(contracts)
      .where(t.where(contracts, eq(contracts.previousVersionId, contract.id), isNull(contracts.deletedAt)))
      .limit(1);
    if (existing) throw conflict("A newer version of this contract already exists.");

    const created = await t.db.transaction(async (tx) => {
      if (contract.status !== "completed" && contract.status !== "voided") {
        await tx
          .update(contracts)
          .set({ status: "voided", updatedAt: new Date() })
          .where(t.where(contracts, eq(contracts.id, contract.id)));
      }
      const [row] = await tx
        .insert(contracts)
        .values({
          workspaceId: t.workspaceId,
          clientId: contract.clientId,
          projectId: contract.projectId,
          templateId: contract.templateId,
          title: contract.title,
          content: contract.content,
          version: contract.version + 1,
          previousVersionId: contract.id,
          publicToken: newPublicToken(),
          createdBy: t.member.id,
        })
        .returning();
      if (!row) throw new Error("Insert returned no row");
      return row;
    });
    return c.json({ contract: await loadDetail(t, c.env.BUCKET, created) }, 201);
  })

  /** Only drafts, and voided contracts nobody signed, can be removed. Anything signed is a record. */
  .delete("/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const contract = await requireContract(t, c.req.valid("param").id);
    const removable = contract.status === "draft" || (contract.status === "voided" && contract.clientSignedAt === null);
    if (!removable) throw conflict("Signed or sent contracts can't be deleted. Void it instead.");
    await t.db
      .update(contracts)
      .set({ deletedAt: new Date() })
      .where(t.where(contracts, eq(contracts.id, contract.id)));
    return c.json({ ok: true });
  });
