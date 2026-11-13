import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Opens a Drizzle client for a Postgres connection string.
 *
 * In the Worker the string comes from the Hyperdrive binding (`env.HYPERDRIVE.connectionString`):
 * Hyperdrive keeps a warm connection pool to Supabase next to the database, so each request skips
 * the TCP + TLS + auth handshakes. Node scripts (seed) pass DATABASE_URL directly.
 *
 * Connections are lazy – nothing is opened until the first query runs.
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    // A Worker request runs a handful of queries; Hyperdrive does the real pooling.
    max: 5,
    // Skip postgres.js' type-catalogue lookup (one extra round-trip per connection we don't need).
    fetch_types: false,
    onnotice: () => undefined,
  });
  return drizzle(client, { schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDb>;
export { schema };
