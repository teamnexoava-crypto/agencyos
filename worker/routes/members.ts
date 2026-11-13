import { Hono } from "hono";
import { tenant } from "../lib/tenant";
import { requireAuth } from "../middleware/context";
import { listMembers } from "../services/members";
import type { AppEnv } from "../types";

/** Workspace directory (names, roles, avatars) for assignee pickers. Team management arrives in Phase 3. */
export const memberRoutes = new Hono<AppEnv>().use(requireAuth).get("/", async (c) => {
  const t = tenant(c);
  return c.json({ members: await listMembers(t.db, t.workspaceId) });
});
