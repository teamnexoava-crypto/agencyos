import { Hono } from "hono";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { markReadSchema } from "../../shared/schemas/settings";
import type { NotificationFeed } from "../../shared/types";
import { notifications } from "../db/schema";
import { tenant } from "../lib/tenant";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import type { AppEnv } from "../types";

/** The signed-in user's own notifications in the active workspace – never anyone else's. */
export const notificationRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get("/", async (c) => {
    const t = tenant(c);
    const mine = t.where(notifications, eq(notifications.userId, t.user.id));
    const [rows, unread] = await Promise.all([
      t.db.select().from(notifications).where(mine).orderBy(desc(notifications.createdAt)).limit(30),
      t.db
        .select({ value: count() })
        .from(notifications)
        .where(and(mine, isNull(notifications.readAt))),
    ]);
    const feed: NotificationFeed = {
      notifications: rows.map((row) => ({ id: row.id, type: row.type, title: row.title, body: row.body, link: row.link, read: row.readAt !== null, createdAt: row.createdAt.getTime() })),
      unread: unread[0]?.value ?? 0,
    };
    return c.json(feed);
  })

  /** Marks the given notifications (or, with no ids, all of them) as read. */
  .post("/read", validate("json", markReadSchema), async (c) => {
    const t = tenant(c);
    const { ids } = c.req.valid("json");
    if (ids?.length === 0) return c.json({ ok: true });
    await t.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(t.where(notifications, eq(notifications.userId, t.user.id), isNull(notifications.readAt), ids ? inArray(notifications.id, ids) : undefined));
    return c.json({ ok: true });
  });
