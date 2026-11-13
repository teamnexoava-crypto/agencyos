import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, isNull } from "drizzle-orm";
import { LOGO_MAX_BYTES } from "../../shared/constants";
import { switchWorkspaceSchema } from "../../shared/schemas/team";
import { createWorkspaceSchema, onboardingSchema } from "../../shared/schemas/workspace";
import type { WorkspaceMembershipDTO } from "../../shared/types";
import { workspaceMembers, workspaces } from "../db/schema";
import { ApiError, badRequest, forbidden } from "../lib/errors";
import { newId } from "../lib/ids";
import { sniffImage } from "../lib/images";
import { setActiveWorkspace } from "../lib/session";
import { requireUser, tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { createWorkspaceForUser, logoUrlFromKey, toWorkspaceDTO } from "../services/workspaces";
import type { AppEnv } from "../types";

/** "" → null so optional text columns stay NULL instead of holding empty strings. */
const emptyToNull = (value: string): string | null => (value === "" ? null : value);

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
    const workspaceId = await createWorkspaceForUser(c.var.db, auth.user, { name });
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

    return c.json({ workspace: toWorkspaceDTO(updated) });
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
      if (previousKey) c.executionCtx.waitUntil(c.env.BUCKET.delete(previousKey));

      return c.json({ logoUrl: logoUrlFromKey(key) }, 201);
    },
  )

  .delete("/logo", async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const previousKey = t.workspace.logoKey;
    if (previousKey) {
      await t.db.update(workspaces).set({ logoKey: null }).where(eq(workspaces.id, t.workspaceId));
      c.executionCtx.waitUntil(c.env.BUCKET.delete(previousKey));
    }
    return c.json({ ok: true });
  });
