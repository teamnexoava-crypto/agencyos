import { Hono } from "hono";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "../../shared/schemas/common";
import { files } from "../db/schema";
import { notFound } from "../lib/errors";
import { tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import type { AppEnv } from "../types";

/**
 * Authenticated downloads of private files stored in R2. Objects are never exposed by key: the file
 * row is looked up inside the caller's workspace first, then its role is checked for that kind.
 */
export const fileRoutes = new Hono<AppEnv>().use(requireAuth).get("/:id", validate("param", z.object({ id: idSchema })), async (c) => {
  const t = tenant(c);
  const [file] = await t.db
    .select()
    .from(files)
    .where(t.where(files, eq(files.id, c.req.valid("param").id), isNull(files.deletedAt)))
    .limit(1);
  if (!file) throw notFound("File");
  // Receipts and signed contracts are finance / legal documents: owner and admin only.
  if (file.kind !== "project_file" && file.kind !== "attachment" && !t.canSeeFinance) throw notFound("File");

  const object = await c.env.BUCKET.get(file.r2Key);
  if (!object) throw notFound("File");

  const inline = file.contentType.startsWith("image/") || file.contentType === "application/pdf";
  return new Response(object.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(object.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
});
