import type { ActivityType, NotificationType } from "../../shared/constants";
import type { Database } from "../db";
import { activityLog, notifications } from "../db/schema";
import type { Tenant } from "../lib/tenant";

interface ActivityEntry {
  type: ActivityType;
  /** Short, already human-readable line, e.g. `Priya created project "Website revamp"`. */
  summary: string;
  entityType: string;
  entityId: string;
  projectId?: string | null;
  /** Hide from members (money-related events). */
  financeOnly?: boolean;
}

/** Appends to the workspace activity feed. Never throws into the request: a failed log line must not fail the action. */
export async function logActivity(t: Tenant, entry: ActivityEntry): Promise<void> {
  try {
    await t.db.insert(activityLog).values({
      workspaceId: t.workspaceId,
      type: entry.type,
      actorMemberId: t.member.id,
      actorName: t.user.name,
      entityType: entry.entityType,
      entityId: entry.entityId,
      projectId: entry.projectId ?? null,
      summary: entry.summary,
      financeOnly: entry.financeOnly ?? false,
    });
  } catch (error) {
    console.error("Failed to write activity log", error);
  }
}

interface NotificationEntry {
  workspaceId: string;
  /** Recipient's user id. */
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** In-app path to open. */
  link?: string;
}

export async function notify(db: Database, entry: NotificationEntry): Promise<void> {
  try {
    await db.insert(notifications).values({
      workspaceId: entry.workspaceId,
      userId: entry.userId,
      type: entry.type,
      title: entry.title,
      body: entry.body ?? null,
      link: entry.link ?? null,
    });
  } catch (error) {
    console.error("Failed to create notification", error);
  }
}
