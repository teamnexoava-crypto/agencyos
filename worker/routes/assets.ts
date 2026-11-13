import { Hono } from "hono";
import { notFound } from "../lib/errors";
import { rateLimit } from "../middleware/rate-limit";
import type { AppEnv } from "../types";

const ID_PATTERN = /^[\w-]{1,64}$/;
const LOGO_FILE_PATTERN = /^[\w-]{1,64}\.(png|jpg|webp)$/;

/**
 * Public, cookie-less asset delivery from R2.
 *
 * Logos are intentionally public: they appear on invoices, contracts and the client portal, all of
 * which are viewed without a login. Keys contain a random id and are immutable, so responses are
 * cached for a year. Nothing else in the bucket is reachable from here – the key is rebuilt from
 * strictly validated path segments.
 */
export const assetRoutes = new Hono<AppEnv>()
  .use(rateLimit({ name: "assets", limit: 300, windowSeconds: 60 }))

  .get("/logo/:workspaceId/:file", async (c) => {
    const { workspaceId, file } = c.req.param();
    if (!ID_PATTERN.test(workspaceId) || !LOGO_FILE_PATTERN.test(file)) throw notFound("Image");

    const object = await c.env.BUCKET.get(`ws/${workspaceId}/logo/${file}`);
    if (!object) throw notFound("Image");

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: object.httpEtag,
      },
    });
  });
