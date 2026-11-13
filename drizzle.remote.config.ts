import { defineConfig } from "drizzle-kit";
import { remoteDatabaseUrl } from "./scripts/env";

/** PRODUCTION database (Supabase): used only by `npm run db:migrate:remote`. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: remoteDatabaseUrl() },
});
