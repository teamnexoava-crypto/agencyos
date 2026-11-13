import { defineConfig } from "drizzle-kit";
import { localDatabaseUrl } from "./scripts/env";

/**
 * LOCAL database: `npm run db:generate` (schema → SQL in ./drizzle) and `npm run db:migrate:local`.
 * The production database uses drizzle.remote.config.ts.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: localDatabaseUrl() },
});
