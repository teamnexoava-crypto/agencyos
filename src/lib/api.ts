import type { ApiErrorBody } from "@shared/types";

/** A non-2xx response from our API, with the server's error code and any field-level messages. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * CSRF token for the current session. It is delivered by GET /api/auth/me and kept in memory only
 * (never in localStorage), then echoed on every state-changing request.
 */
let csrfToken = "";
export function setCsrfToken(token: string) {
  csrfToken = token;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body. */
  json?: unknown;
  /** multipart/form-data body (file uploads). */
  form?: FormData;
  signal?: AbortSignal;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === "object" && error !== null && "message" in error;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  // The person's own calendar date, so "today", "overdue" and "this month" match what they see on screen.
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const headers: Record<string, string> = { Accept: "application/json", "X-Local-Date": localDate };
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form; // the browser sets the multipart boundary itself
  }

  let response: Response;
  try {
    response = await fetch(path, { method, headers, body, signal: options.signal, credentials: "same-origin" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Can't reach the server. Check your connection and try again.");
  }

  const isJson = response.headers.get("Content-Type")?.includes("application/json") ?? false;
  const payload: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (isErrorBody(payload)) {
      throw new ApiError(response.status, payload.error.code, payload.error.message, payload.error.fields);
    }
    throw new ApiError(response.status, "http_error", `Request failed (${response.status}).`);
  }
  return payload as T;
}

/** Human-friendly message for any thrown value – handy for toasts. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}
