# GrowUpliftOS

Multi-tenant SaaS for agency owners, freelancers and service providers: projects, team, finances,
invoices, contracts and e-signatures, with a client-facing share link per project. The app runs on
Cloudflare (Workers + Static Assets, R2, KV); the database is Postgres on Supabase, reached through
Cloudflare Hyperdrive.

The product was first called AgencyOS. The Worker (`agencyos`), its R2 bucket, the GitHub repository and
the local demo accounts (`…@agencyos.local`) keep that name: renaming them would change live addresses
and bindings for no visible benefit. The name people see comes from `APP_NAME` in `shared/constants.ts`.

> **Build status — all 8 phases complete, plus a CRM.**
> Google login and onboarding · clients · projects with milestones and tasks · team and roles ·
> invoices and payments · expenses and receipts · dashboard and profit & loss · contracts with
> e-signatures · project files · client portal · notifications · global search · settings ·
> marketing landing page · CRM (lead pipeline, notes and follow-ups, Google Sheets import).

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
| Contracts  | Tiptap editor, signature_pad, SHA-256 fingerprints via Web Crypto                      |
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
  db/schema.ts            Drizzle schema – all 26 tables
  lib/                    session, tenant scoping, Google OAuth, crypto, validation, errors
  middleware/             request context (db + session), CSRF, rate limiting
  routes/                 auth, workspace (+ settings), members, team, invites, clients, crm, projects,
                          project-portal (files, client link, messages), invoices, contracts,
                          expenses, files, reports, notifications, search,
                          public (token links: /i, /c, /p), assets
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

## Trial, plans and payments

There are three tiers – **Free**, **Growth** and **Premium** – defined in one file, `shared/plans.ts`
(prices, limits, features, and the wording on the cards). The landing page, the Billing screen and the
server-side checks all read from it.

- **Rupees in India, dollars elsewhere.** Each tier has an INR and a USD price (Growth ₹599 / $35,
  Premium ₹1,299 / $75 a month; a year is ten months). A workspace's `billing_currency` is fixed when it
  is created, from Cloudflare's `request.cf.country` (`billingCurrencyFor`: India → INR, anywhere else →
  USD), so travelling or a VPN later doesn't change what it pays. The landing page shows a visitor the
  prices for where they are (`/api/auth/config` → `currency`). Charging in USD needs **International
  Payments** enabled on the Razorpay account; dollar payments are card-only (no UPI) and Razorpay settles
  them in rupees. Locally there is no edge, so set a `dev_country=US` cookie on localhost to try it.
- **Every new workspace starts with 7 days of Premium** (`TRIAL_DAYS`, `TRIAL_PLAN`), no card needed.
- **Then it is on Free, by itself.** Nothing is locked away or deleted. Free is for one person and has
  limits (active projects, clients, invoices a month, leads, storage) and no team members, contracts,
  client portal, finance or Google Sheet sync. The same happens when a paid plan runs out.
- **State is computed, not scheduled.** `billingOf()` (`worker/services/billing.ts`) works out
  `open / exempt / trial / active / free`, the tier, its limits and features from a few columns on the
  workspace on every request. There is no job that has to downgrade anyone.
- **Limits and features are enforced on the server**, where the thing is created or used
  (`assertProjectAvailable`, `assertFeature(t, env, "contracts")`, …). Existing data stays readable:
  a contract made during the trial can still be opened on Free, just not sent. The UI mirrors this
  with upgrade notices and lock icons, but never decides it.
- **One person on Free** is enforced in `tenant()`: anyone but the owner gets `402 plan_seat` and a
  "team is paused" screen until the owner upgrades.
- **Public links:** invoice and contract links already shared keep working on every tier; client
  portal links answer "not found" while the workspace is on Free and work again after an upgrade.
- **Monthly plans are paid by auto-pay; a year (or a single month) is one payment.** Auto-pay is a
  Razorpay subscription: the payer approves a mandate once (UPI AutoPay or card) on Razorpay's hosted
  page, opened in a new tab, and Razorpay collects each month. One-off payments use a Razorpay Payment
  Link, which redirects back. Either way no payment script runs in the app, so the content security
  policy is unchanged.
- **Nothing from the browser or a webhook body is trusted.** A redirect or webhook only says "look at
  this payment link / subscription"; `settlePayment()` and `syncSubscription()` then read it from
  Razorpay with our keys. Both are idempotent (row locks; each auto-pay charge has a number and a
  unique index), so the redirect, the webhooks and our own re-checks can all arrive for the same thing.
- **Paid time.** A one-off payment adds its period exactly where the time already paid for ends;
  switching plans converts unused *paid* time at the old price into days at the new one
  (`nextPaidPeriod`). Trial days are never treated as paid: a mandate approved during the trial
  leaves the workspace on its trial and gives it its plan with the first charge. Each successful
  charge moves `paid_until` to the end of its cycle.
- **Money is never dropped.** A charge taken by a mandate that is not (or no longer) the workspace's
  auto-pay still buys time on the workspace's current plan.
- **Only one thing can ever charge.** A newly approved mandate stops the previous one before it
  becomes the workspace's auto-pay; a one-off payment stops auto-pay before it is settled; deleting a
  workspace stops its mandates first. Every set-up remembers what it was priced on (`basis`): starting
  another, or paying another way, withdraws it, and if it is approved anyway after the workspace has
  moved on it is stopped instead of used. If Razorpay can't confirm the stop, the step is not carried out
  and is retried later (the webhook answers non-2xx so Razorpay redelivers).
- **Failed charges.** While Razorpay retries (`pending`) the plan stays usable for
  `AUTOPAY_GRACE_DAYS` past the paid date; once it gives up (`halted`) or the payer pauses the
  mandate there is no grace. Turning auto-pay off keeps the plan until the date already paid for.
- **It works without webhooks too.** Reading the session (`refreshBillingIfDue`) re-checks Razorpay
  when a charge is due and once more just before a lock screen would be shown; opening Billing
  re-checks everything still open. Webhooks only make it faster.
- **Switching on is fair to existing workspaces.** The first time the keys are present
  (`ensureBillingSwitchedOn`), every workspace that has not paid gets a full trial from that moment.
- `billing_exempt = true` on a workspace means it is never charged or locked.

**Switching payments on** (until then the status is `open`: nothing is limited, locked or chargeable):

1. Razorpay Dashboard → Account & Settings → API keys → generate a key. Add `RAZORPAY_KEY_ID` and
   `RAZORPAY_KEY_SECRET` as secrets on the Worker (dashboard → Settings → Variables and Secrets).
2. Make sure **Subscriptions** is enabled on the Razorpay account (it is a separate product; ask
   Razorpay support if the Subscriptions menu is missing). Without it, starting auto-pay fails with
   "Auto-pay couldn't be started" and people can still pay month by month or yearly.
3. Razorpay Dashboard → Developers → Webhooks → add `https://<your-domain>/api/webhooks/razorpay`,
   choose a secret, tick `payment_link.paid` and every `subscription.*` event, and save the same
   secret on the Worker as `RAZORPAY_WEBHOOK_SECRET`.
4. Use test keys first: start auto-pay and make a one-off payment with Razorpay's test UPI/card, and
   check that Billing shows the plan. Plans created at Razorpay are remembered per key, so switching
   to live keys later simply creates live ones.

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
- **Contracts and e-signatures.** Contract text is rebuilt from an allow-list of tags with no
  attributes on every write (`shared/contract.ts`), so nothing scriptable can be stored. A contract
  can only be edited while it is a draft. Signing records the signer's name, email, IP address,
  user agent, time and the SHA-256 of the exact text, and the client's request must carry the hash of
  the text they were shown. Signature images are size-limited PNGs checked by magic bytes and kept
  in R2. When both parties have signed, a self-contained sealed copy (text, signatures, certificate)
  is written to R2 and served only as a download to owners and admins. Changing a signed contract
  means creating a new version; the signed one stays on record.
- **Signed PDF.** Like invoices, the PDF is the print-optimised document (browser "Save as PDF"): it
  matches what was signed exactly, in any language or script, and costs no Worker CPU. Generating
  PDFs inside the Worker would need embedded fonts and would not fit the free plan's CPU limit.
- **Client portal.** `/p/:token` is resolved by its random token alone and can be switched off or
  regenerated at any time. Its payload is assembled field by field in `worker/services/portal.ts`
  (never by spreading database rows): budgets, costs, expenses, profit, tasks, assignees, step notes
  and amounts, and client notes are simply never read into it. Each section (invoices, contract,
  files, messages) can be switched off per project.
- **Project files.** Uploads are limited to 20 MB and accepted only when their first bytes match an
  allowed format (images, PDF, Office, ZIP, video, PSD, plain text); HTML, SVG and scripts are
  rejected whatever they are named. A file is visible to the client only after an owner or admin
  marks it so, and members can only reach files of projects they are assigned to.
- **Background work.** Anything done after the response (activity log, notifications, storage
  clean-up) goes through `c.var.defer()`, which keeps the per-request database connection open until
  the task has finished.
- **Search and notifications.** Search escapes `%` and `_`, and only returns what the caller's role
  may see (members: their own projects). Notifications are read and marked per user, per workspace.
- **Deleting a workspace.** Owner only, and the request must repeat the workspace name. All stored
  objects under `ws/<id>/` are removed from R2, then the workspace row is deleted and every table
  cascades from it.
- **CRM and Google Sheets.** Owners and admins see every lead; a member only the leads assigned to
  them, without deal values. A sheet is connected by pasting its link (it must be shared as "Anyone
  with the link – Viewer"); no Google permission is requested from the user's account. Only the
  spreadsheet id and tab number are taken from the pasted link, and the CSV export URL is rebuilt on
  `docs.google.com` from those two values, so the Worker cannot be pointed at another host. Downloads
  are capped at 1 MB / 2,000 rows. Syncing only ever adds rows: a lead is matched by e-mail or phone
  and never imported twice, edits made in the CRM are kept, and deleted leads do not come back.
- **Assignments follow access.** Giving someone a task or step on a project they are not on adds
  them to that project's team (owners and admins only; a member can only pick people already on it).
  Taking a member off a project, or out of the workspace, unassigns their open work and leads, so
  nothing stays assigned to a person who can no longer see it.
- **Dates.** The browser sends its calendar date in `X-Local-Date`; the Worker uses it for "today",
  "overdue" and "this month" only when it is within a day of the server's own date, so reports match
  what the person sees without letting the header shift them arbitrarily.
- **Rate limits.** The sign-in flow has the tight per-IP limit. `/api/auth/me` and `/api/auth/config`
  are read on every page load and use the generous one, so an office behind one address is never
  locked out by ordinary browsing.
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

Either connect the GitHub repository in the Cloudflare dashboard (Workers & Pages → Create →
Import a repository; build command `npm run build`, deploy command `npx wrangler deploy`) so that
every push to `main` deploys automatically, or deploy from your machine:

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

## Before you take paying customers

- **Database plan.** Supabase's free plan pauses inactive projects and keeps no backups. Move to a
  paid plan (daily backups) before real customer data depends on it.
- **Workers plan.** The free plan allows 100,000 requests a day and 10 ms of CPU per request, which
  is plenty to start. The paid plan removes those limits.
- **Legal pages.** `/privacy` and `/terms` are starter drafts. Put your business name and contact
  email in them and have them reviewed.
- **Billing.** There is no subscription billing in the app – everyone uses it for free. Charging
  customers needs a payment provider (Razorpay or Stripe) and a plans/limits layer on top.
- **Custom domain.** Recommended before launch, so links sent to clients carry your own name.

