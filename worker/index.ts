import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { ApiErrorBody } from "../shared/types";
import { createDb } from "./db";
import { ApiError } from "./lib/errors";
import { isLocalhost } from "./lib/request";
import { requestContext } from "./middleware/context";
import { csrfProtection } from "./middleware/csrf";
import { assetRoutes } from "./routes/assets";
import { authRoutes } from "./routes/auth";
import { billingRoutes, webhookRoutes } from "./routes/billing";
import { clientRoutes } from "./routes/clients";
import { contractRoutes } from "./routes/contracts";
import { crmRoutes } from "./routes/crm";
import { expenseRoutes } from "./routes/expenses";
import { fileRoutes } from "./routes/files";
import { inviteRoutes } from "./routes/invites";
import { invoiceRoutes } from "./routes/invoices";
import { memberRoutes } from "./routes/members";
import { notificationRoutes } from "./routes/notifications";
import { projectPortalRoutes } from "./routes/project-portal";
import { projectRoutes } from "./routes/projects";
import { publicRoutes } from "./routes/public";
import { reportRoutes } from "./routes/reports";
import { searchRoutes } from "./routes/search";
import { teamRoutes } from "./routes/team";
import { workspaceRoutes } from "./routes/workspace";
import { runScheduledJobs } from "./services/lifecycle";
import type { AppEnv } from "./types";

/**
 * The Worker only handles /api/* (see `run_worker_first` in wrangler.jsonc). Everything else is the
 * React SPA, served by Workers Static Assets with the security headers in public/_headers.
 */
const app = new Hono<AppEnv>().basePath("/api");

// API responses are JSON or binary downloads – never documents – so lock them down completely.
app.use(
  secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    referrerPolicy: "strict-origin-when-cross-origin",
    xFrameOptions: "DENY",
  }),
);

// Public, cacheable, cookie-less assets are mounted BEFORE the session middleware on purpose:
// they must never emit Set-Cookie (which would make shared caching unsafe).
app.route("/assets", assetRoutes);

app.use(async (c, next) => {
  await next();
  // Nothing below this line may be cached by browsers or intermediaries.
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
});
app.use(requestContext);
// Server-to-server calls carry no Origin header or session, so they sit ahead of the CSRF check and
// prove themselves with a signature instead.
app.route("/webhooks", webhookRoutes);
// Local development only: runs the scheduled job on demand (`?now=<ms>` pretends it is another time).
app.post("/dev/run-jobs", async (c) => {
  if (!import.meta.env.DEV || !isLocalhost(c)) return c.json({ error: { code: "not_found", message: "Route not found." } }, 404);
  const at = Number(c.req.query("now"));
  return c.json(await runScheduledJobs(c.var.db, c.env, Number.isFinite(at) && at > 0 ? new Date(at) : new Date()));
});
app.use(csrfProtection);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);
app.route("/workspace", workspaceRoutes);
app.route("/billing", billingRoutes);
app.route("/members", memberRoutes);
app.route("/team", teamRoutes);
app.route("/invites", inviteRoutes);
app.route("/invoices", invoiceRoutes);
app.route("/contracts", contractRoutes);
app.route("/crm", crmRoutes);
app.route("/expenses", expenseRoutes);
app.route("/files", fileRoutes);
app.route("/reports", reportRoutes);
app.route("/notifications", notificationRoutes);
app.route("/search", searchRoutes);
app.route("/public", publicRoutes);
app.route("/clients", clientRoutes);
app.route("/projects", projectRoutes);
app.route("/projects", projectPortalRoutes);

app.notFound((c) => {
  const body: ApiErrorBody = { error: { code: "not_found", message: "Route not found." } };
  return c.json(body, 404);
});

app.onError((error, c) => {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: error.code, message: error.message, fields: error.fields } };
    return c.json(body, error.status);
  }
  if (error instanceof HTTPException) {
    const body: ApiErrorBody = { error: { code: "http_error", message: error.message || "Request failed." } };
    return c.json(body, error.status);
  }
  // Never leak internals: log the real error, return a generic message.
  console.error("Unhandled error", { path: c.req.path, method: c.req.method, error });
  const body: ApiErrorBody = { error: { code: "internal_error", message: "Something went wrong on our side. Please try again." } };
  return c.json(body, 500);
});

export default {
  fetch: app.fetch,
  /** The cron trigger in wrangler.jsonc: billing check-ups and reminder emails (worker/services/lifecycle.ts). */
  scheduled(_controller, env, ctx) {
    const db = createDb(env.HYPERDRIVE.connectionString);
    ctx.waitUntil(
      (async () => {
        try {
          const summary = await runScheduledJobs(db, env);
          console.log("Scheduled jobs finished", summary);
        } catch (error) {
          console.error("Scheduled jobs failed", error);
        } finally {
          await db.$client.end({ timeout: 5 });
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
