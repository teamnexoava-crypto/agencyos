import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An error that is safe to show to the caller. Anything else becomes a generic 500. */
export class ApiError extends HTTPException {
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: ContentfulStatusCode, code: string, message: string, fields?: Record<string, string>) {
    super(status, { message });
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, code = "bad_request") => new ApiError(400, code, message);
export const unauthorized = (message = "Please sign in to continue.") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "You don't have permission to do that.", code = "forbidden") =>
  new ApiError(403, code, message);
export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found.`);
export const tooManyRequests = (message = "Too many requests. Please slow down and try again shortly.") =>
  new ApiError(429, "rate_limited", message);
