import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { localDatabaseUrl } from "./scripts/env";

// One source of truth for the local database: DATABASE_URL (from .env) is handed to Wrangler as the
// local connection string of the HYPERDRIVE binding, so `npm run dev`, migrations and the seed script
// all talk to the same Postgres. Production uses the real Hyperdrive config instead.
process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??= localDatabaseUrl();

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: framework code changes far less often than app code, so returning
        // visitors keep these cached across deploys.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/, priority: 2 },
            { name: "motion", test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/, priority: 2 },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
});
