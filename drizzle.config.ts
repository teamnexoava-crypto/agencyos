import { defineConfig } from "drizzle-kit";

// Only used for `drizzle-kit generate` (schema → SQL migration files in ./drizzle).
// Migrations are applied with Wrangler: `npm run db:migrate:local` / `npm run db:migrate:remote`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
});
