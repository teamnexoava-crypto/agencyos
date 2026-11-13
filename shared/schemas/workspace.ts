import { z } from "zod";
import { CURRENCY_CODES } from "../constants";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Trimmed optional text: empty strings are normalised to "" (the API stores them as NULL). */
const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

export const invoicePrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, "Add a prefix, e.g. INV")
  .max(10, "Keep the prefix to 10 characters or fewer")
  .regex(/^[A-Z0-9][A-Z0-9/-]*$/, "Use letters, numbers, - or / only");

export const phoneSchema = z
  .string()
  .trim()
  .max(20, "That phone number looks too long")
  .refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{6,18}$/.test(v), "Enter a valid phone number, e.g. +91 98765 43210");

export const workspaceProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your agency name").max(80, "Keep the name under 80 characters"),
    currency: z.enum(CURRENCY_CODES),
    gstNumber: optionalText(20).toUpperCase(),
    address: optionalText(500),
    phone: phoneSchema,
    invoicePrefix: invoicePrefixSchema,
  })
  .superRefine((value, ctx) => {
    if (value.gstNumber === "") return;
    // GSTINs have a strict format; other countries' tax IDs are free-form alphanumerics.
    const valid = value.currency === "INR" ? GSTIN_REGEX.test(value.gstNumber) : /^[A-Z0-9-]{4,20}$/.test(value.gstNumber);
    if (!valid) {
      ctx.addIssue({
        code: "custom",
        path: ["gstNumber"],
        message: value.currency === "INR" ? "Enter a valid 15-character GSTIN" : "Enter a valid tax ID",
      });
    }
  });

/** Onboarding collects exactly the workspace profile; the logo is uploaded separately. */
export const onboardingSchema = workspaceProfileSchema;
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Enter your agency name").max(80),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

/** Formats the next invoice number exactly as the server will, for live previews. */
export function formatInvoiceNumber(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}
