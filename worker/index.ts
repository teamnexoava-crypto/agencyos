import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { ApiErrorBody } from "../shared/types";
import { ApiError } from "./lib/errors";
import { requestContext } from "./middleware/context";
import { csrfProtection } from "./middleware/csrf";
import { assetRoutes } from "./routes/assets";
import { authRoutes } from "./routes/auth";
import { clientRoutes } from "./routes/clients";
import { memberRoutes } from "./routes/members";
import { projectRoutes } from "./routes/projects";
import { workspaceRoutes } from "./routes/workspace";
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
app.use(csrfProtection);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);
app.route("/workspace", workspaceRoutes);
app.route("/members", memberRoutes);
app.route("/clients", clientRoutes);
app.route("/projects", projectRoutes);

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

export default app;
