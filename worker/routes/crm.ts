import { Hono } from "hono";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { type LEAD_MAP_FIELDS, type LeadStage } from "../../shared/constants";
import { idSchema } from "../../shared/schemas/common";
import { leadNoteSchema, leadSchema, leadSourceSchema, leadSourceUpdateSchema, leadUpdateSchema, sheetPreviewSchema } from "../../shared/schemas/crm";
import type { LeadDTO, LeadDetail, LeadNoteDTO, LeadSourceDTO, SheetPreview, SyncResult } from "../../shared/types";
import { clients, leadNotes, leadSources, leads, workspaceMembers } from "../db/schema";
import { ApiError, forbidden, notFound } from "../lib/errors";
import { fetchSheet, parseSheetUrl, sheetViewUrl, suggestMapping } from "../lib/sheets";
import { tenant, type Tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { rateLimit } from "../middleware/rate-limit";
import { logActivity, notify } from "../services/activity";
import { requireMembers } from "../services/members";
import type { AppEnv } from "../types";

const idParam = z.object({ id: idSchema });
const noteParam = z.object({ id: idSchema, noteId: idSchema });
const emptyToNull = (value: string): string | null => (value === "" ? null : value);
const conflict = (message: string) => new ApiError(409, "conflict", message);

type LeadRow = typeof leads.$inferSelect;
type SourceRow = typeof leadSources.$inferSelect;

const STAGE_LABEL: Record<LeadStage, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal sent", won: "Won", lost: "Lost" };

/** Owners and admins work every lead; a member only the ones assigned to them. */
const leadVisibility = (t: Tenant): SQL | undefined => (t.canSeeFinance ? undefined : eq(leads.assigneeId, t.member.id));

const toLeadDTO = (t: Tenant, row: LeadRow): LeadDTO => ({
  id: row.id,
  name: row.name,
  company: row.company,
  email: row.email,
  phone: row.phone,
  stage: row.stage,
  // Deal values are money: owner and admin only.
  value: t.canSeeFinance ? row.value : null,
  assigneeId: row.assigneeId,
  followUpDate: row.followUpDate,
  lastContactedAt: row.lastContactedAt?.getTime() ?? null,
  sourceLabel: row.sourceLabel,
  clientId: t.canSeeFinance ? row.clientId : null,
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
});

const toSourceDTO = (row: SourceRow): LeadSourceDTO => ({
  id: row.id,
  name: row.name,
  url: sheetViewUrl(row),
  mapping: row.mapping,
  lastSyncedAt: row.lastSyncedAt?.getTime() ?? null,
  lastSyncError: row.lastSyncError,
  rowsImported: row.rowsImported,
});

async function requireLead(t: Tenant, id: string): Promise<LeadRow> {
  const [row] = await t.db
    .select()
    .from(leads)
    .where(t.where(leads, eq(leads.id, id), isNull(leads.deletedAt), leadVisibility(t)))
    .limit(1);
  // 404 rather than 403: a member must not learn that someone else's lead exists.
  if (!row) throw notFound("Lead");
  return row;
}

async function requireSource(t: Tenant, id: string): Promise<SourceRow> {
  const [row] = await t.db
    .select()
    .from(leadSources)
    .where(t.where(leadSources, eq(leadSources.id, id), isNull(leadSources.deletedAt)))
    .limit(1);
  if (!row) throw notFound("Sheet");
  return row;
}

async function loadDetail(t: Tenant, lead: LeadRow): Promise<LeadDetail> {
  const noteRows = await t.db
    .select()
    .from(leadNotes)
    .where(t.where(leadNotes, eq(leadNotes.leadId, lead.id)))
    .orderBy(desc(leadNotes.createdAt))
    .limit(500);
  const notes: LeadNoteDTO[] = noteRows.map((note) => ({
    id: note.id,
    kind: note.kind,
    body: note.body,
    authorName: note.authorName,
    canDelete: note.kind !== "system" && (t.canSeeFinance || note.authorMemberId === t.member.id),
    createdAt: note.createdAt.getTime(),
  }));
  return { ...toLeadDTO(t, lead), extra: lead.extra, notes };
}

const systemNote = (t: Tenant, leadId: string, body: string) => ({ workspaceId: t.workspaceId, leadId, kind: "system" as const, body, authorMemberId: t.member.id, authorName: t.user.name });

/** Tells a teammate a lead is now theirs (unless they assigned it to themselves). */
async function notifyAssignee(t: Tenant, lead: LeadRow): Promise<void> {
  if (!lead.assigneeId || lead.assigneeId === t.member.id) return;
  const [member] = await t.db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(t.where(workspaceMembers, eq(workspaceMembers.id, lead.assigneeId), isNull(workspaceMembers.removedAt)))
    .limit(1);
  if (!member) return;
  await notify(t.db, { workspaceId: t.workspaceId, userId: member.userId, type: "lead.assigned", title: `New lead for you: ${lead.name}`, body: `${t.user.name} assigned this lead to you.`, link: `/app/crm?lead=${lead.id}` });
}

/* ------------------------------------------------------------------------------------------------
 * Google Sheet sync
 * ---------------------------------------------------------------------------------------------- */

/** How an e-mail address or phone number is compared: lower case, or the last 10 digits. */
const emailKey = (email: string | null) => (email ? email.trim().toLowerCase() : "");
function phoneKey(phone: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : "";
}

/**
 * Reads the sheet and adds the rows that have not been imported before. Existing leads are never
 * touched (edits made in the CRM win), and a lead deleted in the CRM does not come back.
 */
async function syncSource(t: Tenant, source: SourceRow, testOrigin: string | undefined): Promise<{ added: number; skipped: number }> {
  const { headers, rows } = await fetchSheet(source, testOrigin);
  const column = (field: (typeof LEAD_MAP_FIELDS)[number]) => {
    const header = source.mapping[field];
    return header ? headers.indexOf(header) : -1;
  };
  const index = { name: column("name"), phone: column("phone"), email: column("email"), company: column("company") };
  if (index.name === -1 && index.phone === -1 && index.email === -1) {
    throw new ApiError(400, "sheet_columns_changed", "The columns in this sheet have changed. Open “Edit columns” and choose them again.");
  }
  const mapped = new Set(Object.values(index).filter((value) => value !== -1));

  // Someone already in the CRM is not added again: matched by e-mail or phone against this sheet's
  // earlier imports (including leads deleted since) and every other lead in the workspace.
  const known = await t.db
    .select({ email: leads.email, phone: leads.phone, sourceId: leads.sourceId, deletedAt: leads.deletedAt })
    .from(leads)
    .where(t.where(leads));
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const lead of known) {
    if (lead.deletedAt !== null && lead.sourceId !== source.id) continue;
    if (lead.email) emails.add(emailKey(lead.email));
    if (lead.phone && phoneKey(lead.phone)) phones.add(phoneKey(lead.phone));
  }

  const seen = new Set<string>();
  const values: (typeof leads.$inferInsert)[] = [];
  for (const row of rows) {
    const at = (position: number) => (position === -1 ? "" : (row[position] ?? ""));
    const email = at(index.email).slice(0, 254);
    const phone = at(index.phone).slice(0, 40);
    const name = (at(index.name) || email || phone).slice(0, 120);
    if (!name) continue;
    const byEmail = emailKey(email);
    const byPhone = phoneKey(phone);
    if ((byEmail && emails.has(byEmail)) || (byPhone && phones.has(byPhone))) continue;
    const key = byEmail || byPhone ? `id:${byEmail || byPhone}` : `row:${row.join("|").toLowerCase().slice(0, 300)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (byEmail) emails.add(byEmail);
    if (byPhone) phones.add(byPhone);

    const extra: Record<string, string> = {};
    headers.forEach((header, position) => {
      const value = row[position] ?? "";
      if (header && value && !mapped.has(position) && Object.keys(extra).length < 30) extra[header.slice(0, 80)] = value.slice(0, 1000);
    });
    values.push({
      workspaceId: t.workspaceId,
      sourceId: source.id,
      sourceKey: key,
      sourceLabel: source.name,
      name,
      company: at(index.company).slice(0, 120) || null,
      email: email || null,
      phone: phone || null,
      extra,
      createdBy: t.member.id,
    });
  }

  let added = 0;
  for (let start = 0; start < values.length; start += 400) {
    const inserted = await t.db
      .insert(leads)
      .values(values.slice(start, start + 400))
      .onConflictDoNothing({ target: [leads.sourceId, leads.sourceKey] })
      .returning({ id: leads.id });
    if (inserted.length > 0) {
      await t.db.insert(leadNotes).values(inserted.map((lead) => ({ workspaceId: t.workspaceId, leadId: lead.id, kind: "system" as const, body: `Imported from Google Sheet “${source.name}”`, authorName: "AgencyOS" })));
      added += inserted.length;
    }
  }
  return { added, skipped: rows.length - added };
}

/** Runs a sync and records how it went on the source, so the UI can show "last synced" or the problem. */
async function runSync(t: Tenant, source: SourceRow, testOrigin: string | undefined): Promise<SyncResult> {
  try {
    const { added, skipped } = await syncSource(t, source, testOrigin);
    const [updated] = await t.db
      .update(leadSources)
      .set({ lastSyncedAt: new Date(), lastSyncError: null, rowsImported: sql`${leadSources.rowsImported} + ${added}`, updatedAt: new Date() })
      .where(t.where(leadSources, eq(leadSources.id, source.id)))
      .returning();
    return { source: toSourceDTO(updated ?? source), added, skipped };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "The sync failed. Please try again.";
    await t.db
      .update(leadSources)
      .set({ lastSyncError: message.slice(0, 300), updatedAt: new Date() })
      .where(t.where(leadSources, eq(leadSources.id, source.id)));
    throw error;
  }
}

/**
 * CRM: leads, their notes and the Google Sheets they are imported from.
 *
 * Who can do what:
 *  - owner / admin: everything, including connecting sheets, deal values, deleting and converting.
 *  - member: only leads assigned to them – update the stage and details, add notes, add new leads
 *    (which are assigned to themselves). Never deal values or other people's leads.
 */
export const crmRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  /* ---------------------------------------------------------------- leads */

  .get("/leads", async (c) => {
    const t = tenant(c);
    const rows = await t.db
      .select()
      .from(leads)
      .where(t.where(leads, isNull(leads.deletedAt), leadVisibility(t)))
      .orderBy(desc(leads.createdAt))
      .limit(5000);
    return c.json({ leads: rows.map((row) => toLeadDTO(t, row)) });
  })

  .post("/leads", validate("json", leadSchema), async (c) => {
    const t = tenant(c);
    const input = c.req.valid("json");
    // A member's own lead is theirs; only managers hand leads to other people.
    const assigneeId = t.canSeeFinance ? emptyToNull(input.assigneeId) : t.member.id;
    if (assigneeId) await requireMembers(t.db, t.workspaceId, [assigneeId]);

    const [row] = await t.db
      .insert(leads)
      .values({
        workspaceId: t.workspaceId,
        name: input.name,
        company: emptyToNull(input.company),
        email: emptyToNull(input.email),
        phone: emptyToNull(input.phone),
        sourceLabel: emptyToNull(input.sourceLabel) ?? "Added manually",
        stage: input.stage,
        value: t.canSeeFinance ? input.value : null,
        assigneeId,
        followUpDate: emptyToNull(input.followUpDate),
        closedAt: input.stage === "won" || input.stage === "lost" ? new Date() : null,
        createdBy: t.member.id,
      })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    await t.db.insert(leadNotes).values(systemNote(t, row.id, "Lead added"));
    c.var.defer(
      Promise.all([logActivity(t, { type: "lead.created", summary: `${t.user.name} added the lead ${row.name}`, entityType: "lead", entityId: row.id, financeOnly: true }), notifyAssignee(t, row)]),
    );
    return c.json({ lead: await loadDetail(t, row) }, 201);
  })

  .get("/leads/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    return c.json({ lead: await loadDetail(t, await requireLead(t, c.req.valid("param").id)) });
  })

  .patch("/leads/:id", validate("param", idParam), validate("json", leadUpdateSchema), async (c) => {
    const t = tenant(c);
    const lead = await requireLead(t, c.req.valid("param").id);
    const input = c.req.valid("json");

    const values: Partial<typeof leads.$inferInsert> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.company !== undefined) values.company = emptyToNull(input.company);
    if (input.email !== undefined) values.email = emptyToNull(input.email);
    if (input.phone !== undefined) values.phone = emptyToNull(input.phone);
    if (input.sourceLabel !== undefined) values.sourceLabel = emptyToNull(input.sourceLabel);
    if (input.followUpDate !== undefined) values.followUpDate = emptyToNull(input.followUpDate);
    // Money and assignment stay with owners and admins; a member's request simply doesn't change them.
    if (t.canSeeFinance && input.value !== undefined) values.value = input.value;
    if (t.canSeeFinance && input.assigneeId !== undefined) {
      values.assigneeId = emptyToNull(input.assigneeId);
      if (values.assigneeId) await requireMembers(t.db, t.workspaceId, [values.assigneeId]);
    }
    const stageChanged = input.stage !== undefined && input.stage !== lead.stage;
    if (input.stage !== undefined && stageChanged) {
      values.stage = input.stage;
      values.closedAt = input.stage === "won" || input.stage === "lost" ? new Date() : null;
    }

    const [updated] = await t.db
      .update(leads)
      .set({ ...values, updatedAt: new Date() })
      .where(t.where(leads, eq(leads.id, lead.id)))
      .returning();
    if (!updated) throw notFound("Lead");

    if (stageChanged) await t.db.insert(leadNotes).values(systemNote(t, lead.id, `Moved from ${STAGE_LABEL[lead.stage]} to ${STAGE_LABEL[updated.stage]}`));
    const reassigned = values.assigneeId !== undefined && values.assigneeId !== lead.assigneeId;
    c.var.defer(
      Promise.all([
        stageChanged && updated.stage === "won"
          ? logActivity(t, { type: "lead.won", summary: `${t.user.name} won the lead ${updated.name}`, entityType: "lead", entityId: updated.id, financeOnly: true })
          : Promise.resolve(),
        reassigned ? notifyAssignee(t, updated) : Promise.resolve(),
      ]),
    );
    return c.json({ lead: await loadDetail(t, updated) });
  })

  /** Kept in the database (hidden) so a later sheet sync doesn't bring the same row back. */
  .delete("/leads/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const lead = await requireLead(t, c.req.valid("param").id);
    await t.db
      .update(leads)
      .set({ deletedAt: new Date() })
      .where(t.where(leads, eq(leads.id, lead.id)));
    return c.json({ ok: true });
  })

  .post("/leads/:id/notes", validate("param", idParam), validate("json", leadNoteSchema), async (c) => {
    const t = tenant(c);
    const lead = await requireLead(t, c.req.valid("param").id);
    const input = c.req.valid("json");
    await t.db.insert(leadNotes).values({ workspaceId: t.workspaceId, leadId: lead.id, kind: input.kind, body: input.body, authorMemberId: t.member.id, authorName: t.user.name });
    // A logged call, message or meeting counts as contact; a plain note does not.
    const [updated] = await t.db
      .update(leads)
      .set({ updatedAt: new Date(), ...(input.kind !== "note" && { lastContactedAt: new Date() }) })
      .where(t.where(leads, eq(leads.id, lead.id)))
      .returning();
    return c.json({ lead: await loadDetail(t, updated ?? lead) }, 201);
  })

  .delete("/leads/:id/notes/:noteId", validate("param", noteParam), async (c) => {
    const t = tenant(c);
    const { id, noteId } = c.req.valid("param");
    const lead = await requireLead(t, id);
    const [note] = await t.db
      .select()
      .from(leadNotes)
      .where(t.where(leadNotes, eq(leadNotes.id, noteId), eq(leadNotes.leadId, lead.id)))
      .limit(1);
    if (!note) throw notFound("Note");
    // The history the app writes itself (stage changes, imports) can't be removed.
    if (note.kind === "system") throw forbidden("That entry is part of the lead's history and can't be deleted.");
    if (!t.canSeeFinance && note.authorMemberId !== t.member.id) throw forbidden("You can only delete your own notes.");
    await t.db.delete(leadNotes).where(t.where(leadNotes, eq(leadNotes.id, note.id)));
    return c.json({ lead: await loadDetail(t, lead) });
  })

  /** Turns a lead into a client (and marks it won), so projects, contracts and invoices can follow. */
  .post("/leads/:id/convert", validate("param", idParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const lead = await requireLead(t, c.req.valid("param").id);
    if (lead.clientId) throw conflict("This lead is already a client.");

    const updated = await t.db.transaction(async (tx) => {
      const [client] = await tx
        .insert(clients)
        .values({ workspaceId: t.workspaceId, name: lead.name, company: lead.company, email: lead.email, whatsapp: lead.phone?.slice(0, 20) ?? null })
        .returning({ id: clients.id });
      if (!client) throw new Error("Insert returned no row");
      const [row] = await tx
        .update(leads)
        .set({ clientId: client.id, stage: "won", closedAt: lead.closedAt ?? new Date(), updatedAt: new Date() })
        .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, t.workspaceId), isNull(leads.clientId)))
        .returning();
      if (!row) throw conflict("This lead is already a client.");
      await tx.insert(leadNotes).values(systemNote(t, lead.id, lead.stage === "won" ? "Converted to a client" : `Marked as won and converted to a client`));
      return row;
    });
    c.var.defer(logActivity(t, { type: "client.created", summary: `${t.user.name} converted the lead ${lead.name} to a client`, entityType: "client", entityId: updated.clientId ?? lead.id }));
    return c.json({ lead: await loadDetail(t, updated) });
  })

  /* ---------------------------------------------------------------- Google Sheets (owner / admin) */

  .get("/sources", async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const rows = await t.db
      .select()
      .from(leadSources)
      .where(t.where(leadSources, isNull(leadSources.deletedAt)))
      .orderBy(asc(leadSources.createdAt));
    return c.json({ sources: rows.map(toSourceDTO) });
  })

  /** Looks at a sheet before connecting it: column names, a few rows and a suggested mapping. */
  .post("/sources/preview", rateLimit("AUTH_LIMITER"), validate("json", sheetPreviewSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const { headers, rows } = await fetchSheet(parseSheetUrl(c.req.valid("json").url), c.env.SHEETS_TEST_ORIGIN);
    const preview: SheetPreview = { headers: headers.filter((header) => header !== ""), sampleRows: rows.slice(0, 3), rowCount: rows.length, suggestedMapping: suggestMapping(headers) };
    return c.json({ preview });
  })

  .post("/sources", rateLimit("AUTH_LIMITER"), validate("json", leadSourceSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const input = c.req.valid("json");
    const ref = parseSheetUrl(input.url);
    // A sheet that was disconnected earlier is revived, so its rows are recognised and not imported twice.
    const [existing] = await t.db
      .select()
      .from(leadSources)
      .where(t.where(leadSources, eq(leadSources.sheetId, ref.sheetId), eq(leadSources.gid, ref.gid)))
      .limit(1);
    if (existing && existing.deletedAt === null) throw new ApiError(409, "conflict", "This sheet is already connected.", { url: "This sheet is already connected" });
    if ((await t.db.$count(leadSources, t.where(leadSources, isNull(leadSources.deletedAt)))) >= 20) throw conflict("You can connect up to 20 sheets. Disconnect one first.");

    const [source] = existing
      ? await t.db
          .update(leadSources)
          .set({ name: input.name, mapping: input.mapping, published: ref.published, deletedAt: null, lastSyncError: null, updatedAt: new Date() })
          .where(t.where(leadSources, eq(leadSources.id, existing.id)))
          .returning()
      : await t.db
          .insert(leadSources)
          .values({ workspaceId: t.workspaceId, name: input.name, ...ref, mapping: input.mapping, createdBy: t.member.id })
          .returning();
    if (!source) throw new Error("Write returned no row");
    try {
      return c.json(await runSync(t, source, c.env.SHEETS_TEST_ORIGIN), 201);
    } catch (error) {
      // Nothing was imported, so don't leave a half-connected sheet behind.
      await t.db
        .update(leadSources)
        .set({ deletedAt: new Date() })
        .where(t.where(leadSources, eq(leadSources.id, source.id)));
      throw error;
    }
  })

  .patch("/sources/:id", validate("param", idParam), validate("json", leadSourceUpdateSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const source = await requireSource(t, c.req.valid("param").id);
    const input = c.req.valid("json");
    const [updated] = await t.db
      .update(leadSources)
      .set({ name: input.name, mapping: input.mapping, lastSyncError: null, updatedAt: new Date() })
      .where(t.where(leadSources, eq(leadSources.id, source.id)))
      .returning();
    if (!updated) throw notFound("Sheet");
    return c.json({ source: toSourceDTO(updated) });
  })

  .post("/sources/:id/sync", rateLimit("AUTH_LIMITER"), validate("param", idParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const source = await requireSource(t, c.req.valid("param").id);
    return c.json(await runSync(t, source, c.env.SHEETS_TEST_ORIGIN));
  })

  /** Disconnects the sheet. Leads that came from it stay. */
  .delete("/sources/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const source = await requireSource(t, c.req.valid("param").id);
    await t.db
      .update(leadSources)
      .set({ deletedAt: new Date() })
      .where(t.where(leadSources, eq(leadSources.id, source.id)));
    return c.json({ ok: true });
  });
