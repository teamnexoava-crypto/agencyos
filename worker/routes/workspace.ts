import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, isNull, max } from "drizzle-orm";
import { DEFAULT_WA_CONTRACT_TEMPLATE, DEFAULT_WA_INVITE_TEMPLATE, DEFAULT_WA_INVOICE_TEMPLATE, LOGO_MAX_BYTES } from "../../shared/constants";
import { deleteWorkspaceSchema, settingsInvoicingSchema, settingsMessagesSchema, settingsProfileSchema } from "../../shared/schemas/settings";
import { switchWorkspaceSchema } from "../../shared/schemas/team";
import { createWorkspaceSchema, onboardingSchema } from "../../shared/schemas/workspace";
import { billingCurrencyFor } from "../../shared/plans";
import type { WorkspaceMembershipDTO, WorkspaceSettings } from "../../shared/types";
import { invoices, workspaceMembers, workspaces } from "../db/schema";
import { ApiError, badRequest, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { sniffImage } from "../lib/images";
import { setActiveWorkspace } from "../lib/session";
import { requireUser, tenant, type Tenant } from "../lib/tenant";
import { visitorCountry } from "../lib/request";
import { validate } from "../lib/validate";
import { isDodoConfigured } from "../lib/dodo";
import { isBillingConfigured } from "../lib/razorpay";
import { requireAuth } from "../middleware/context";
import { cancelAllSubscriptions } from "../services/billing";
import { addSampleData, removeSampleData } from "../services/sample-data";
import { createWorkspaceForUser, logoUrlFromKey, toWorkspaceDTO } from "../services/workspaces";
import type { AppEnv, WorkspaceRow } from "../types";

/** "" → null so optional text columns stay NULL instead of holding empty strings. */
const emptyToNull = (value: string): string | null => (value === "" ? null : value);

/** One above the highest invoice number already issued – the counter may never go below this. */
async function minNextInvoiceNumber(t: Tenant): Promise<number> {
  const [row] = await t.db
    .select({ value: max(invoices.sequence) })
    .from(invoices)
    .where(t.where(invoices));
  return (row?.value ?? 0) + 1;
}

async function toSettings(t: Tenant, ws: WorkspaceRow): Promise<WorkspaceSettings> {
  return {
    name: ws.name,
    logoUrl: logoUrlFromKey(ws.logoKey),
    currency: ws.currency,
    email: ws.email ?? "",
    phone: ws.phone ?? "",
    website: ws.website ?? "",
    address: ws.address ?? "",
    gstNumber: ws.gstNumber ?? "",
    brandColor: ws.brandColor,
    invoicePrefix: ws.invoicePrefix,
    invoiceNextNumber: ws.invoiceNextNumber,
    invoiceMinNextNumber: await minNextInvoiceNumber(t),
    invoiceDueDays: ws.invoiceDueDays,
    defaultTaxMode: ws.defaultTaxMode,
    defaultTaxRate: ws.defaultTaxRate,
    invoiceNotes: ws.invoiceNotes ?? "",
    invoiceTerms: ws.invoiceTerms ?? "",
    bankDetails: ws.bankDetails ?? "",
    upiId: ws.upiId ?? "",
    waInvoiceTemplate: ws.waInvoiceTemplate ?? "",
    waContractTemplate: ws.waContractTemplate ?? "",
    waInviteTemplate: ws.waInviteTemplate ?? "",
    defaults: { waInvoiceTemplate: DEFAULT_WA_INVOICE_TEMPLATE, waContractTemplate: DEFAULT_WA_CONTRACT_TEMPLATE, waInviteTemplate: DEFAULT_WA_INVITE_TEMPLATE },
  };
}

async function saveSettings(t: Tenant, values: Partial<typeof workspaces.$inferInsert>) {
  const [updated] = await t.db
    .update(workspaces)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(workspaces.id, t.workspaceId))
    .returning();
  if (!updated) throw new ApiError(500, "update_failed", "Could not save your settings.");
  return { settings: await toSettings(t, updated), workspace: toWorkspaceDTO(updated) };
}

/** Removes every stored object of a workspace (logo, receipts, project files, signatures, sealed contracts). */
async function purgeWorkspaceObjects(bucket: R2Bucket, workspaceId: string): Promise<void> {
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const listing = await bucket.list({ prefix: `ws/${workspaceId}/`, cursor, limit: 1000 });
    if (listing.objects.length > 0) await bucket.delete(listing.objects.map((object) => object.key));
    if (!listing.truncated) return;
    cursor = listing.cursor;
  }
}

export const workspaceRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get("/", (c) => c.json({ workspace: toWorkspaceDTO(tenant(c).workspace) }))

  /**
   * Creates a workspace for a signed-in user who has none (e.g. they were removed from their only
   * workspace). Users who already have a workspace cannot create more through this route.
   */
  .post("/", validate("json", createWorkspaceSchema), async (c) => {
    const auth = requireUser(c);
    if (auth.workspace) throw forbidden("You already belong to a workspace.");
    const { name } = c.req.valid("json");
    const workspaceId = await createWorkspaceForUser(c.var.db, auth.user, { name, billingCurrency: billingCurrencyFor(visitorCountry(c)) });
    await setActiveWorkspace(c.var.db, auth.sessionId, workspaceId);
    return c.json({ ok: true }, 201);
  })

  /** Every workspace the signed-in user belongs to (for the workspace switcher). */
  .get("/memberships", async (c) => {
    const auth = requireUser(c);
    const rows = await c.var.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, auth.user.id), isNull(workspaceMembers.removedAt), isNull(workspaces.deletedAt)))
      .orderBy(workspaceMembers.createdAt);
    const memberships: WorkspaceMembershipDTO[] = rows.map((row) => ({
      workspaceId: row.workspace.id,
      name: row.workspace.name,
      logoUrl: logoUrlFromKey(row.workspace.logoKey),
      role: row.role,
      active: row.workspace.id === auth.workspace?.id,
    }));
    return c.json({ memberships });
  })

  /** Switches the session to another workspace the user is a member of. */
  .post("/switch", validate("json", switchWorkspaceSchema), async (c) => {
    const auth = requireUser(c);
    const { workspaceId } = c.req.valid("json");
    const [membership] = await c.var.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(eq(workspaceMembers.userId, auth.user.id), eq(workspaceMembers.workspaceId, workspaceId), isNull(workspaceMembers.removedAt), isNull(workspaces.deletedAt)),
      )
      .limit(1);
    // Same answer whether the workspace doesn't exist or the user simply isn't in it.
    if (!membership) throw forbidden("You are not a member of that workspace.");
    await setActiveWorkspace(c.var.db, auth.sessionId, workspaceId);
    return c.json({ ok: true });
  })

  /** Completes onboarding: saves the agency profile and marks the workspace as onboarded. */
  .post("/onboarding", validate("json", onboardingSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner");
    const input = c.req.valid("json");

    const [updated] = await t.db
      .update(workspaces)
      .set({
        name: input.name,
        currency: input.currency,
        gstNumber: emptyToNull(input.gstNumber),
        address: emptyToNull(input.address),
        phone: emptyToNull(input.phone),
        invoicePrefix: input.invoicePrefix,
        // GST-registered Indian agencies almost always charge CGST+SGST by default.
        defaultTaxMode: input.currency === "INR" && input.gstNumber !== "" ? "cgst_sgst" : "none",
        onboardedAt: t.workspace.onboardedAt ?? new Date(),
      })
      .where(eq(workspaces.id, t.workspaceId))
      .returning();
    if (!updated) throw new ApiError(500, "update_failed", "Could not save your workspace.");

    // On first set-up the workspace can start with example data, so every screen shows what it does.
    if (input.sampleData && !t.workspace.onboardedAt && !updated.sampleDataAt) {
      try {
        await addSampleData(t.db, updated, t.member.id);
        const [withSample] = await t.db.select().from(workspaces).where(eq(workspaces.id, t.workspaceId)).limit(1);
        if (withSample) return c.json({ workspace: toWorkspaceDTO(withSample) });
      } catch (error) {
        // Sample data is a nicety: onboarding still succeeds without it.
        console.error("Could not add sample data during onboarding", error);
      }
    }
    return c.json({ workspace: toWorkspaceDTO(updated) });
  })

  /** Adds example clients, projects, invoices, a contract, leads and expenses to look around with. */
  .post("/sample-data", async (c) => {
    const t = tenant(c, { allowLocked: true });
    t.requireRole("owner", "admin");
    const [ws] = await t.db.select().from(workspaces).where(eq(workspaces.id, t.workspaceId)).limit(1);
    if (!ws) throw notFound("Workspace");
    await addSampleData(t.db, ws, t.member.id);
    return c.json({ ok: true }, 201);
  })

  /** Removes all the example data in one go. Anything the team made itself stays. */
  .delete("/sample-data", async (c) => {
    const t = tenant(c, { allowLocked: true });
    t.requireRole("owner", "admin");
    await removeSampleData(t.db, t.workspaceId);
    return c.json({ ok: true });
  })

  /**
   * Uploads (or replaces) the workspace logo. multipart/form-data with a single `file` field.
   * PNG / JPEG / WebP only, max 2 MB; the real type is sniffed from the bytes.
   */
  .post(
    "/logo",
    bodyLimit({
      maxSize: LOGO_MAX_BYTES + 64 * 1024, // allow for multipart overhead
      onError: () => {
        throw new ApiError(413, "file_too_large", "Logo must be 2 MB or smaller.");
      },
    }),
    async (c) => {
      const t = tenant(c);
      t.requireRole("owner", "admin");

      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw badRequest("Attach an image in the `file` field.", "file_missing");
      if (file.size === 0) throw badRequest("That file is empty.", "file_empty");
      if (file.size > LOGO_MAX_BYTES) throw new ApiError(413, "file_too_large", "Logo must be 2 MB or smaller.");

      const bytes = new Uint8Array(await file.arrayBuffer());
      const image = sniffImage(bytes);
      if (!image) throw new ApiError(415, "unsupported_type", "Upload a PNG, JPEG or WebP image.");

      const key = `ws/${t.workspaceId}/logo/${newId()}.${image.ext}`;
      await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: image.mime } });
      await t.db.update(workspaces).set({ logoKey: key }).where(eq(workspaces.id, t.workspaceId));

      // Each upload gets a fresh key (so URLs are immutable + cacheable); drop the previous object.
      const previousKey = t.workspace.logoKey;
      if (previousKey) c.var.defer(c.env.BUCKET.delete(previousKey));

      return c.json({ logoUrl: logoUrlFromKey(key) }, 201);
    },
  )

  .delete("/logo", async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const previousKey = t.workspace.logoKey;
    if (previousKey) {
      await t.db.update(workspaces).set({ logoKey: null }).where(eq(workspaces.id, t.workspaceId));
      c.var.defer(c.env.BUCKET.delete(previousKey));
    }
    return c.json({ ok: true });
  })

  /* ---------------------------------------------------------------- settings (owner / admin) */

  .get("/settings", async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    return c.json({ settings: await toSettings(t, t.workspace) });
  })

  .put("/settings/profile", validate("json", settingsProfileSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const input = c.req.valid("json");
    return c.json(
      await saveSettings(t, {
        name: input.name,
        email: emptyToNull(input.email),
        phone: emptyToNull(input.phone),
        website: emptyToNull(input.website),
        address: emptyToNull(input.address),
        gstNumber: emptyToNull(input.gstNumber),
        brandColor: input.brandColor.toLowerCase(),
      }),
    );
  })

  .put("/settings/invoicing", validate("json", settingsInvoicingSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const input = c.req.valid("json");
    const minimum = await minNextInvoiceNumber(t);
    if (input.invoiceNextNumber < minimum) {
      throw new ApiError(400, "validation_error", "That invoice number is already used.", { invoiceNextNumber: `Must be ${minimum} or higher – earlier numbers are already used` });
    }
    return c.json(
      await saveSettings(t, {
        invoicePrefix: input.invoicePrefix,
        invoiceNextNumber: input.invoiceNextNumber,
        invoiceDueDays: input.invoiceDueDays,
        defaultTaxMode: input.defaultTaxMode,
        defaultTaxRate: input.defaultTaxMode === "none" ? t.workspace.defaultTaxRate : input.defaultTaxRate,
        invoiceNotes: emptyToNull(input.invoiceNotes),
        invoiceTerms: emptyToNull(input.invoiceTerms),
        bankDetails: emptyToNull(input.bankDetails),
        upiId: emptyToNull(input.upiId),
      }),
    );
  })

  .put("/settings/messages", validate("json", settingsMessagesSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const input = c.req.valid("json");
    return c.json(
      await saveSettings(t, {
        waInvoiceTemplate: emptyToNull(input.waInvoiceTemplate),
        waContractTemplate: emptyToNull(input.waContractTemplate),
        waInviteTemplate: emptyToNull(input.waInviteTemplate),
      }),
    );
  })

  /**
   * Deletes the workspace and everything in it, for good. Owner only, and only when the request
   * repeats the workspace name. Stored files go first, then the database row (every table hangs off
   * it with ON DELETE CASCADE).
   */
  .delete("/", validate("json", deleteWorkspaceSchema), async (c) => {
    // Still allowed after a trial or plan has ended: people must always be able to remove their data.
    const t = tenant(c, { allowLocked: true });
    t.requireRole("owner");
    if (c.req.valid("json").confirmName.trim() !== t.workspace.name) {
      throw new ApiError(400, "validation_error", "The name doesn't match.", { confirmName: "Type the workspace name exactly" });
    }
    // Auto-pay must be stopped at Razorpay / Dodo before the records of it disappear, or it would keep charging.
    if (isBillingConfigured(c.env) || isDodoConfigured(c.env)) {
      try {
        await cancelAllSubscriptions(t.db, c.env, t.workspaceId);
      } catch (error) {
        console.error("Could not stop auto-pay before deleting a workspace", error);
        throw new ApiError(502, "payment_provider_error", "We couldn't turn off auto-pay, so nothing was deleted. Please try again in a minute.");
      }
    }
    await purgeWorkspaceObjects(c.env.BUCKET, t.workspaceId);
    await t.db.delete(workspaces).where(eq(workspaces.id, t.workspaceId));
    return c.json({ ok: true });
  });
