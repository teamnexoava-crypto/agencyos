# AgencyOS

Multi-tenant SaaS for agency owners, freelancers and service providers: projects, team, finances,
invoices, contracts and e-signatures, with a client-facing share link per project. The app runs on
Cloudflare (Workers + Static Assets, R2, KV); the database is Postgres on Supabase, reached through
Cloudflare Hyperdrive.

> **Build status — Phase 5 of 8 complete.**
> Done: setup, Postgres schema, Google login, onboarding, app shell · clients · projects · team ·
> invoices and payments · expenses with categories and receipts · dashboard (KPIs, revenue vs
> expenses, profit trend, project status, top clients, deadlines, overdue invoices, activity) ·
> profit & loss by month, project, client and category with CSV export.
> Next: contracts & e-sign → client portal → landing page, notifications, polish.

## Stack

| Layer      | Choice                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------- |
| Hosting    | Cloudflare Workers + Static Assets, deployed with Wrangler                               |
| API        | Hono (TypeScript), all routes under `/api`                                               |
| Database   | Supabase Postgres via Cloudflare Hyperdrive + Drizzle ORM + Drizzle migrations           |
| Files      | Cloudflare R2                                                                            |
| Rate limit | Cloudflare Rate Limiting binding (KV binding kept for caching)                           |
| Frontend   | React 19 + Vite + TypeScript, React Router, TanStack Query                               |
| UI         | Tailwind CSS v4, shadcn/ui (Radix), Lucide icons, Motion                                 |
| Forms      | React Hook Form + Zod — schemas in `shared/` are used by both the browser and the Worker |
| Charts     | Recharts, with a colour-blind-validated palette defined as CSS tokens                    |
| PDF        | Print-optimised HTML: "Download PDF" opens the browser's Save-as-PDF with an A4 layout    |
| Auth       | Google OAuth 2.0 (PKCE) via `arctic`, sessions in Postgres, httpOnly cookies. No passwords. |

## Quick start (local)

Requires Node.js 22.22+ and a local Postgres 15+. The easiest is the Supabase CLI (needs Docker),
which starts one on port 54322 — the default this project expects:

```bash
npx supabase init && npx supabase start
```

Any other Postgres works too: put its connection string in `.env` as `DATABASE_URL`.

```bash
npm install
cp .dev.vars.example .dev.vars     # then edit: set SESSION_SECRET (openssl rand -base64 32)
cp .env.example .env               # DATABASE_URL for local Postgres
npm run db:migrate:local           # creates the tables
npm run db:seed                    # optional: demo workspace "Northwind Studio"
npm run dev                        # http://localhost:5173
```

R2 and KV are simulated locally by Wrangler/Miniflare, and the Hyperdrive binding connects straight
to your local Postgres — no Cloudflare or Supabase account is needed to develop.

**Signing in locally.** Under `npm run dev` on `localhost`, the login page shows a **Continue as demo
user** button, so you can work without Google credentials. That route is compiled out of production
builds (it is registered inside an `import.meta.env.DEV` block). To test real Google sign-in locally,
put your OAuth client ID and secret in `.dev.vars` (see [Google OAuth](#2-google-oauth-client)).

To see the app as a teammate (members only see their own projects and never see budgets), sign in
as one of the seeded users from the browser console on `/login`:

```js
await fetch("/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "diya@agencyos.local" }) });
```

Seeded teammates: `aarav@` (admin), `diya@` and `kabir@` (members), all `@agencyos.local`. Any other
`…@agencyos.local` address creates a fresh user with an empty workspace – handy for checking that
one workspace can never see another's data.

To see the onboarding flow again, skip `db:seed` (or empty the local tables:
`delete from workspaces; delete from users;`).

## Scripts

| Script                      | What it does                                                          |
| --------------------------- | --------------------------------------------------------------------- |
| `npm run dev`               | Vite dev server with the Worker running in `workerd` (HMR for both)   |
| `npm run build`             | Type-check, then build the client and the Worker into `dist/`         |
| `npm run preview`           | Build, then serve the production build locally                        |
| `npm run check`             | Type-check + ESLint                                                   |
| `npm run cf-typegen`        | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc`          |
| `npm run db:generate`       | Generate a SQL migration in `drizzle/` from `worker/db/schema.ts`     |
| `npm run db:migrate:local`  | Apply migrations to the local Postgres (`DATABASE_URL`)               |
| `npm run db:migrate:remote` | Apply migrations to Supabase (`DATABASE_URL_REMOTE`)                  |
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
  routes/                 auth, workspace, members, team, invites, clients, projects, invoices,
                          expenses, files, reports, public (token links), assets
  services/               Business logic shared by routes and the seed script
src/                    The React app
  components/ui/          shadcn/ui primitives
  components/layout/      App shell: sidebar, top bar, quick nav, page transitions
  components/shared/      Empty state, page header, brand, skeletons
  features/               Data hooks + feature components (auth, onboarding, …)
  pages/                  Route components (lazy-loaded per route)
  router.tsx              Route table + guards
drizzle/                Generated SQL migrations (applied with drizzle-kit)
scripts/seed.ts         Local demo data
scripts/env.ts          Reads DATABASE_URL / DATABASE_URL_REMOTE from .env for tooling
public/_headers         Security headers + caching for the SPA and static assets
wrangler.jsonc          Worker config: Hyperdrive, R2, KV bindings, required secrets
```

## How it is secured

- **Tenancy.** Every business table has `workspace_id`. Handlers never read a workspace id from the
  request; they call `tenant(c)` (`worker/lib/tenant.ts`), which derives it from the server-side
  session and builds every `WHERE` through `t.where(table, …)`, so the workspace predicate cannot be
  left out.
- **Database exposure.** Supabase publishes every table in the `public` schema through its Data
  API to anyone holding the project's public anon key. Row Level Security is therefore enabled on
  every table with no policies, which denies that API everything; the Worker connects as the
  database owner, which RLS does not restrict. The app never uses the Data API, so you can also
  switch it off in the Supabase dashboard (step 1 below).
- **Roles.** `owner`, `admin`, `member`. Checked on the server with `t.requireRole(…)`; the UI hides
  what a role cannot use but is never the enforcement point. Members only receive projects they are
  assigned to (anything else answers 404, not 403, so existence isn't revealed), may update step
  status and manage tasks there, and are never sent budgets, milestone amounts or the client list.
- **Invites.** An invite link carries a 32-character random token, expires after 7 days, can be
  revoked, and can only be accepted by the Google account whose email it was created for – a
  forwarded or leaked link is useless to anyone else. Only the owner can grant the admin role.
- **Public invoice links.** `/i/<token>` uses a 32-character random token that can be reset at any
  time. Drafts are not reachable. The endpoint returns only what is printed on the invoice – no ids,
  no internal client notes, no WhatsApp number – and is rate-limited.
- **Invoice totals.** Line amounts, discount, GST and totals are always recomputed on the server
  with the same code the editor's preview uses (`shared/invoice.ts`); numbers sent by a browser are
  never stored. Invoice numbers come from a row-locked counter, so they can't collide.
- **Finance visibility.** Revenue, expenses, profit, member costs, budgets and receipts are computed
  and sent only for owners and admins. A member's dashboard request returns `finance: null`, and the
  activity feed they get excludes money events and projects they are not on.
- **Private files.** Receipts live in R2 under random keys and are only served through
  `/api/files/:id`, which looks the file up inside the caller's workspace and checks their role.
- **Foreign ids.** Client, member and project ids sent by the browser are looked up inside the
  caller's workspace before use, so an id from another workspace is rejected rather than linked.
- **Sessions.** A random 256-bit token lives in an `HttpOnly; Secure; SameSite=Lax` cookie. The database stores
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
- **Rate limiting.** Cloudflare's native Rate Limiting binding, per IP, on `/api/auth/*` and public
  routes. Limits are enforced per edge location, which suits abuse throttling (not exact quotas).
- **Secrets.** Never committed. They live only on the deployed Worker and in your local `.dev.vars`.
  Until all three are set, sign-in is switched off and the login page says so.

## Deploying to Cloudflare

### 1. Supabase database

1. Create a project at [supabase.com](https://supabase.com/dashboard). Pick the region closest to
   your users (for India: Mumbai, `ap-south-1`) and save the database password.
2. Open **Connect** and copy the **Session pooler** connection string (port `5432`). Put it in
   `.env` as `DATABASE_URL_REMOTE`, with the password filled in (URL-encode special characters).
3. Create the tables:

```bash
npm run db:migrate:remote
```

4. Recommended: in the project settings, under **Data API**, turn the Data API off. The app does not use it,
   and RLS already blocks it, so this just removes an unused entry point.

Do not create or edit these tables from the Supabase dashboard — schema changes go through
`worker/db/schema.ts` and migrations, so local and production stay identical.

### 1b. Cloudflare resources

```bash
npx wrangler login
```

Hyperdrive pools connections to Supabase so the Worker does not pay a new TLS + auth handshake on
every request. Use the same **Session pooler** string as above (not the transaction pooler on port
6543 — Hyperdrive does that pooling itself):

```bash
npx wrangler hyperdrive create agencyos-db --caching-disabled --connection-string="postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres"
```

`--caching-disabled` matters: Hyperdrive otherwise caches read queries for up to a minute, and this
app must never serve a stale session, permission or invoice.

```bash
npx wrangler r2 bucket create agencyos-uploads
```

```bash
npx wrangler kv namespace create KV
```

Copy the IDs printed by the Hyperdrive and KV commands into `wrangler.jsonc`:

```jsonc
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<Hyperdrive id>", "localConnectionString": "…" }],
"kv_namespaces": [{ "binding": "KV", "id": "<KV id>" }],
```

(R2 needs no ID — the bucket name is the reference. R2 must be enabled once on your account in the
Cloudflare dashboard. If the Hyperdrive command is refused, check that Hyperdrive is available on
your Workers plan.)

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

### 4. Deploy

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
remotely before (or together with) the deploy that needs it. New tables must end with
`.enableRLS()` (see "How it is secured").
