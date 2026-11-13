import type { Role } from "../shared/constants";
import type { Database } from "./db";
import type { users, workspaceMembers, workspaces } from "./db/schema";

export type UserRow = typeof users.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type MemberRow = typeof workspaceMembers.$inferSelect;

/** Everything we know about the caller, resolved once per request from the session cookie. */
export interface AuthContext {
  sessionId: string;
  user: UserRow;
  /** The session's active workspace; `null` if the user no longer belongs to any workspace. */
  workspace: WorkspaceRow | null;
  member: MemberRow | null;
}

/** An AuthContext that is guaranteed to have a workspace + membership. */
export interface WorkspaceContext extends AuthContext {
  workspace: WorkspaceRow;
  member: MemberRow;
  role: Role;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Database;
    auth: AuthContext | null;
  };
}
