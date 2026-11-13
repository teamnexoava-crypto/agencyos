/**
 * Database connection strings for Node-side tooling (drizzle-kit, seed script, Vite config).
 * Values come from the environment, falling back to a local `.env` file.
 *
 *   DATABASE_URL          local Postgres used for development (default: Supabase CLI's local database)
 *   DATABASE_URL_REMOTE   your Supabase project – only used by `npm run db:migrate:remote`
 */
import { existsSync } from "node:fs";

export const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (existsSync(".env")) {
  // Does not override variables that are already set in the real environment.
  process.loadEnvFile(".env");
}

export function localDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_LOCAL_DATABASE_URL;
}

export function remoteDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_REMOTE?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL_REMOTE is not set. Add your Supabase connection string (Connect → Session pooler) to .env – see .env.example.",
    );
  }
  return url;
}

export function isLocalDatabase(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}
