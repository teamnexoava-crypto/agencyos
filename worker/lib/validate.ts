import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { ApiError } from "./errors";

/**
 * Zod request validation with a consistent error shape:
 * `{ error: { code: "validation_error", message, fields: { "path.to.field": "message" } } }`
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (result.success) return;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_";
      fields[path] ??= issue.message;
    }
    throw new ApiError(400, "validation_error", "Please check the highlighted fields.", fields);
  });
}
