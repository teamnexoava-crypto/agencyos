# AgencyOS

Multi-tenant SaaS for agency owners, freelancers and service providers: projects, team, finances,
invoices, contracts and e-signatures, with a client-facing share link per project. Runs entirely on
Cloudflare (Workers + Static Assets, D1, R2, KV).

> **Build status — Phase 1 of 8 complete.**
> Done: project setup, Cloudflare config, full database schema + migration, Google login, sessions,
> CSRF, rate limiting, onboarding, app shell (sidebar, top bar, dark mode, page transitions).
> Next: clients & projects → team → invoices → finance & dashboard → contracts & e-sign → client
> portal → landing page, notifications, polish.

## Stack

| Layer      | Choice                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------- |
| Hosting    | Cloudflare Workers + Static Assets, deployed with Wrangler                               |
| API        | Hono (TypeScript), all routes under `/api`                                               |
| Database   | Cloudflare D1 (SQLite) + Drizzle ORM + Drizzle migrations                                |
| Files      | Cloudflare R2                                                                            |
| Rate limit | Cloudflare KV (fixed-window counters)                                                    |
| Frontend   | React 19 + Vite + TypeScript, React Router, TanStack Query                               |
| UI         | Tailwind CSS v4, shadcn/ui (Radix), Lucide icons, Motion                                 |
| Forms      | React Hook Form + Zod — schemas in `shared/` are used by both the browser and the Worker |
| Auth       | Google OAuth 2.0 (PKCE) via `arctic`, sessions in D1, httpOnly cookies. No passwords.    |

## Quick start (local)

Requires Node.js 22.22+.

```bash
npm install
cp .dev.vars.example .dev.vars     # then edit: set SESSION_SECRET (openssl rand -base64 32)
npm run db:migrate:local           # creates the local D1 database in .wrangler/
npm run db:seed                    # optional: demo workspace "Northwind Studio"
npm run dev                        # http://localhost:5173
```

Local D1, R2 and KV are simulated by Wrangler/Miniflare — no Cloudflare account is needed to develop.

**Signing in locally.** Under `npm run dev` on `localhost`, the login page shows a **Continue as demo
user** button, so you can work without Google credentials. That route is compiled out of production
builds (it is registered inside an `import.meta.env.DEV` block). To test real Google sign-in locally,
put your OAuth client ID and secret in `.dev.vars` (see [Google OAuth](#2-google-oauth-client)).

To see the onboarding flow again, skip `db:seed` (or wipe local data with `rm -rf .wrangler/state`
and re-run the migration).

## Scripts

| Script                      | What it does                                                          |
| --------------------------- | --------------------------------------------------------------------- |
| `npm run dev`               | Vite dev server with the Worker running in `workerd` (HMR for both)   |
| `npm run build`             | Type-check, then build the client and the Worker into `dist/`         |
| `npm run preview`           | Build, then serve the production build locally                        |
| `npm run check`             | Type-check + ESLint                                                   |
| `npm run cf-typegen`        | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc`          |
| `npm run db:generate`       | Generate a SQL migration in `drizzle/` from `worker/db/schema.ts`     |
| `npm run db:migrate:local`  | Apply migrations to the local D1 database                             |
| `npm run db:migrate:remote` | Apply migrations to the production D1 database                        |
| `npm run db:seed`           | Seed the local database with demo data (re-runnable)                  |
| `npm run deploy`            | Build and deploy to Cloudflare                                        |

## Project structure

```
shared/                 Code used by BOTH the browser and the Worker
  constants.ts            Enums (roles, statuses, currencies…) – feed Drizzle columns and Zod
  schemas/                Zod schemas (validated client-side by RHF, server-side by Hono)
  types.ts                API response types
worker/                 The API (Cloudflare Worker, Hono)
  index.ts                App entry: security headers, middleware order, routes, error handler
  db/schema.ts            Drizzle schema – all 23 tables
  lib/                    session, tenant scoping, Google OAuth, crypto, validation, errors
  middleware/             request context (db + session), CSRF, rate limiting
  routes/                 auth, workspace, assets (one file per resource)
  services/               Business logic shared by routes and the seed script
src/                    The React app
  components/ui/          shadcn/ui primitives
  components/layout/      App shell: sidebar, top bar, quick nav, page transitions
  components/shared/      Empty state, page header, brand, skeletons
  features/               Data hooks + feature components (auth, onboarding, …)
  pages/                  Route components (lazy-loaded per route)
  router.tsx              Route table + guards
drizzle/                Generated SQL migrations (applied with Wrangler)
scripts/seed.ts         Local demo data
public/_headers         Security headers + caching for the SPA and static assets
wrangler.jsonc          Worker config: D1, R2, KV bindings, required secrets
```

## How it is secured

- **Tenancy.** Every business table has `workspace_id`. Handlers never read a workspace id from the
  request; they call `tenant(c)` (`worker/lib/tenant.ts`), which derives it from the server-side
  session and builds every `WHERE` through `t.where(table, …)`, so the workspace predicate cannot be
  left out.
- **Roles.** `owner`, `admin`, `member`. Checked on the server with `t.requireRole(…)`; the UI hides
  what a role cannot use but is never the enforcement point.
- **Sessions.** A random 256-bit token lives in an `HttpOnly; Secure; SameSite=Lax` cookie. D1 stores
  only its SHA-256 hash. Sessions last 30 days and roll forward once half the lifetime is used.
- **CSRF.** State-changing requests must (1) carry an `Origin` header equal to the app's origin and
  (2) when signed in, an `X-CSRF-Token` header — an HMAC of the session id keyed by `SESSION_SECRET`.
- **OAuth.** Authorization-code flow with PKCE and a `state` cookie; ID-token claims (`iss`, `aud`,
  `exp`, `email_verified`) are validated; post-login redirects accept same-site paths only.
- **Validation.** Every request body is parsed with Zod; errors come back as
  `{ error: { code, message, fields } }`.
- **Uploads.** Size-limited, and the real file type is sniffed from magic bytes (SVG is rejected).
- **Headers.** Strict CSP (`script-src 'self'`), HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` on pages (`public/_headers`) and API responses.
- **Rate limiting.** KV-backed, per IP, on `/api/auth/*` and public asset routes. KV is eventually
  consistent, so limits are approximate — suitable for abuse throttling, not exact quotas.
- **Secrets.** Never committed. `wrangler.jsonc` declares them under `secrets.required`, so a deploy
  fails fast if one is missing.

## Deploying to Cloudflare

### 1. Create the Cloudflare resources

```bash
npx wrangler login
```

```bash
npx wrangler d1 create agencyos
```

```bash
npx wrangler r2 bucket create agencyos-files
```

```bash
npx wrangler kv namespace create KV
```

Copy the IDs printed by the D1 and KV commands into `wrangler.jsonc`:

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "agencyos", "database_id": "<D1 id>", "migrations_dir": "drizzle" }],
"kv_namespaces": [{ "binding": "KV", "id": "<KV id>" }],
```

(R2 needs no ID — the bucket name is the reference. R2 must be enabled once on your account in the
Cloudflare dashboard.)

### 2. Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and support
   email, and add the scopes `openid`, `email` and `profile`. Publish the app when you are ready for
   users outside your test list.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorised JavaScript origins**
   - `http://localhost:5173`
   - `https://<your-production-domain>`
5. **Authorised redirect URIs** (must match exactly, no trailing slash)
   - `http://localhost:5173/api/auth/google/callback`
   - `https://<your-production-domain>/api/auth/google/callback`
6. Copy the client ID and client secret.

If you first deploy to the default `*.workers.dev` address, add that origin and redirect URI too.

### 3. Secrets

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

```bash
openssl rand -base64 32
```

```bash
npx wrangler secret put SESSION_SECRET
```

Paste the `openssl` output when prompted for `SESSION_SECRET`. Changing it later invalidates open
tabs' CSRF tokens (users just need to refresh); sessions themselves stay valid.

### 4. Migrate and deploy

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

Wrangler prints the live URL (`https://agencyos.<your-subdomain>.workers.dev`).

### 5. Custom domain

The domain's zone must be on Cloudflare. Add to `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "app.example.com", "custom_domain": true }],
"vars": { "APP_URL": "https://app.example.com" }
```

Then run `npm run deploy` again — Cloudflare creates the DNS record and certificate automatically.
(Alternatively: dashboard → Workers & Pages → agencyos → Settings → Domains & Routes → Add → Custom
domain.) Setting `APP_URL` pins OAuth redirects and share links to that one origin; make sure the
matching redirect URI from step 2 exists in Google Cloud Console.

### Changing the schema later

```bash
npm run db:generate
```

```bash
npm run db:migrate:local
```

```bash
npm run db:migrate:remote
```

Edit `worker/db/schema.ts`, generate, review the SQL in `drizzle/`, apply locally, test, then apply
remotely before (or together with) the deploy that needs it.
