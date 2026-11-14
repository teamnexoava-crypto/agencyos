import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "../../shared/schemas/common";
import { PROJECT_FILE_MAX_BYTES, commentSchema, fileShareSchema, shareLinkSchema } from "../../shared/schemas/portal";
import type { ProjectFileDTO, ShareLinkDTO } from "../../shared/types";
import { comments, files, shareLinks } from "../db/schema";
import { ApiError, badRequest, forbidden, notFound } from "../lib/errors";
import { newId, newPublicToken } from "../lib/ids";
import { tenant, type Tenant } from "../lib/tenant";
import { cleanFileName, sniffProjectFile } from "../lib/uploads";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { logActivity } from "../services/activity";
import { assertStorageAvailable } from "../services/billing";
import { toCommentDTO } from "../services/portal";
import { requireProject } from "../services/projects";
import type { AppEnv } from "../types";

const projectParam = z.object({ projectId: idSchema });
const fileParam = z.object({ projectId: idSchema, fileId: idSchema });
const commentParam = z.object({ projectId: idSchema, commentId: idSchema });

type FileRow = typeof files.$inferSelect;
type ShareLinkRow = typeof shareLinks.$inferSelect;

const toFileDTO = (row: FileRow): ProjectFileDTO => ({
  id: row.id,
  name: row.name,
  contentType: row.contentType,
  size: row.size,
  sharedWithClient: row.sharedWithClient,
  uploadedBy: row.uploadedBy,
  createdAt: row.createdAt.getTime(),
});

const toShareLinkDTO = (row: ShareLinkRow): ShareLinkDTO => ({
  token: row.token,
  enabled: row.enabled,
  showInvoices: row.showInvoices,
  showContract: row.showContract,
  showFiles: row.showFiles,
  allowComments: row.allowComments,
  viewCount: row.viewCount,
  lastViewedAt: row.lastViewedAt?.getTime() ?? null,
});

async function requireProjectFile(t: Tenant, projectId: string, fileId: string): Promise<FileRow> {
  const [row] = await t.db
    .select()
    .from(files)
    .where(t.where(files, eq(files.id, fileId), eq(files.projectId, projectId), eq(files.kind, "project_file"), isNull(files.deletedAt)))
    .limit(1);
  if (!row) throw notFound("File");
  return row;
}

async function findShareLink(t: Tenant, projectId: string): Promise<ShareLinkRow | null> {
  const [row] = await t.db
    .select()
    .from(shareLinks)
    .where(t.where(shareLinks, eq(shareLinks.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

/**
 * Project files, the client link and its message thread. Mounted next to the project routes.
 *
 * Who can do what:
 *  - any member on the project: see, upload and download files; delete their own uploads.
 *  - owner / admin: also decide which files the client sees, manage the client link and the messages.
 */
export const projectPortalRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  /* ---------------------------------------------------------------- files */

  .get("/:projectId/files", validate("param", projectParam), async (c) => {
    const t = tenant(c);
    const project = await requireProject(t, c.req.valid("param").projectId);
    const rows = await t.db
      .select()
      .from(files)
      .where(t.where(files, eq(files.projectId, project.id), eq(files.kind, "project_file"), isNull(files.deletedAt)))
      .orderBy(desc(files.createdAt));
    return c.json({ files: rows.map(toFileDTO) });
  })

  /** multipart/form-data, field `file`. The type is decided from the file's bytes, never from what the browser claims. */
  .post(
    "/:projectId/files",
    validate("param", projectParam),
    bodyLimit({
      maxSize: PROJECT_FILE_MAX_BYTES + 64 * 1024,
      onError: () => {
        throw new ApiError(413, "file_too_large", "Files must be 20 MB or smaller.");
      },
    }),
    async (c) => {
      const t = tenant(c);
      const project = await requireProject(t, c.req.valid("param").projectId);

      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw badRequest("Attach a file in the `file` field.", "file_missing");
      if (file.size === 0) throw badRequest("That file is empty.", "file_empty");
      if (file.size > PROJECT_FILE_MAX_BYTES) throw new ApiError(413, "file_too_large", "Files must be 20 MB or smaller.");

      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = sniffProjectFile(bytes, file.name);
      if (!kind) throw new ApiError(415, "unsupported_type", "That file type isn't supported. Upload images, PDFs, Office documents, ZIP archives, text files, videos or design files.");

      await assertStorageAvailable(t, c.env, bytes.byteLength);
      const key = `ws/${t.workspaceId}/projects/${project.id}/${newId()}.${kind.ext}`;
      await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: kind.mime } });
      const [row] = await t.db
        .insert(files)
        .values({
          workspaceId: t.workspaceId,
          projectId: project.id,
          kind: "project_file",
          r2Key: key,
          name: cleanFileName(file.name, `file.${kind.ext}`),
          contentType: kind.mime,
          size: bytes.byteLength,
          uploadedBy: t.member.id,
        })
        .returning();
      if (!row) throw new Error("Insert returned no row");

      c.var.defer(
        logActivity(t, { type: "file.uploaded", summary: `${t.user.name} uploaded "${row.name}" to ${project.title}`, entityType: "file", entityId: row.id, projectId: project.id }),
      );
      return c.json({ file: toFileDTO(row) }, 201);
    },
  )

  /** Show or hide a file on the client portal. Nothing is shared until someone switches it on. */
  .patch("/:projectId/files/:fileId", validate("param", fileParam), validate("json", fileShareSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const { projectId, fileId } = c.req.valid("param");
    const project = await requireProject(t, projectId);
    const file = await requireProjectFile(t, project.id, fileId);
    const [row] = await t.db
      .update(files)
      .set({ sharedWithClient: c.req.valid("json").sharedWithClient })
      .where(t.where(files, eq(files.id, file.id)))
      .returning();
    if (!row) throw notFound("File");
    return c.json({ file: toFileDTO(row) });
  })

  .delete("/:projectId/files/:fileId", validate("param", fileParam), async (c) => {
    const t = tenant(c);
    const { projectId, fileId } = c.req.valid("param");
    const project = await requireProject(t, projectId);
    const file = await requireProjectFile(t, project.id, fileId);
    if (!t.canSeeFinance && file.uploadedBy !== t.member.id) throw forbidden("You can only delete files you uploaded.");
    await t.db
      .update(files)
      .set({ deletedAt: new Date(), sharedWithClient: false })
      .where(t.where(files, eq(files.id, file.id)));
    c.var.defer(c.env.BUCKET.delete(file.r2Key));
    return c.json({ ok: true });
  })

  /* ---------------------------------------------------------------- client link */

  .get("/:projectId/share", validate("param", projectParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    const link = await findShareLink(t, project.id);
    return c.json({ link: link ? toShareLinkDTO(link) : null });
  })

  /** Creates the link the first time, then updates what it shows. Switching it off makes the URL 404 without losing it. */
  .put("/:projectId/share", validate("param", projectParam), validate("json", shareLinkSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    const input = c.req.valid("json");
    const [row] = await t.db
      .insert(shareLinks)
      .values({ workspaceId: t.workspaceId, projectId: project.id, token: newPublicToken(), ...input })
      .onConflictDoUpdate({ target: shareLinks.projectId, set: { ...input, updatedAt: new Date() } })
      .returning();
    if (!row) throw new Error("Upsert returned no row");
    return c.json({ link: toShareLinkDTO(row) });
  })

  /** New URL; the old one stops working at once. */
  .post("/:projectId/share/regenerate", validate("param", projectParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    const [row] = await t.db
      .update(shareLinks)
      .set({ token: newPublicToken(), viewCount: 0, lastViewedAt: null, updatedAt: new Date() })
      .where(t.where(shareLinks, eq(shareLinks.projectId, project.id)))
      .returning();
    if (!row) throw notFound("Client link");
    return c.json({ link: toShareLinkDTO(row) });
  })

  /* ---------------------------------------------------------------- messages with the client */

  .get("/:projectId/comments", validate("param", projectParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    const rows = await t.db
      .select()
      .from(comments)
      .where(t.where(comments, eq(comments.projectId, project.id), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt))
      .limit(500);
    return c.json({ comments: rows.map(toCommentDTO) });
  })

  .post("/:projectId/comments", validate("param", projectParam), validate("json", commentSchema), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const project = await requireProject(t, c.req.valid("param").projectId);
    const [row] = await t.db
      .insert(comments)
      .values({ workspaceId: t.workspaceId, projectId: project.id, authorType: "member", authorName: t.user.name, authorMemberId: t.member.id, body: c.req.valid("json").body })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    return c.json({ comment: toCommentDTO(row) }, 201);
  })

  .delete("/:projectId/comments/:commentId", validate("param", commentParam), async (c) => {
    const t = tenant(c);
    t.requireRole("owner", "admin");
    const { projectId, commentId } = c.req.valid("param");
    const project = await requireProject(t, projectId);
    const [row] = await t.db
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(t.where(comments, eq(comments.id, commentId), eq(comments.projectId, project.id), isNull(comments.deletedAt)))
      .returning({ id: comments.id });
    if (!row) throw notFound("Message");
    return c.json({ ok: true });
  });
