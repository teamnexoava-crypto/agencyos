import { z } from "zod";
import { SIGNATURE_METHODS } from "../constants";
import { contractText } from "../contract";
import { optionalIdSchema } from "./common";

export const CONTRACT_CONTENT_MAX = 200_000;
/** Signature images are small PNGs drawn in the browser. */
export const SIGNATURE_MAX_BYTES = 200 * 1024;
const SIGNATURE_PREFIX = "data:image/png;base64,";

const titleSchema = z.string().trim().min(1, "Give it a title").max(160, "Keep the title under 160 characters");
const contentSchema = z.string().max(CONTRACT_CONTENT_MAX, "This document is too long");
const filledContentSchema = contentSchema.refine((html) => contractText(html).length > 0, "Write the agreement text first");

export const contractTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name the template").max(120, "Keep the name under 120 characters"),
  content: filledContentSchema,
});
export type ContractTemplateInput = z.infer<typeof contractTemplateSchema>;

export const contractCreateSchema = z.object({
  title: titleSchema,
  clientId: optionalIdSchema,
  projectId: optionalIdSchema,
  /** "" → start from a blank document. */
  templateId: optionalIdSchema,
});
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = z.object({ title: titleSchema, content: contentSchema });
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;

const signatureImageSchema = z
  .string()
  .startsWith(SIGNATURE_PREFIX, "Add your signature")
  // base64 is 4 characters per 3 bytes.
  .max(SIGNATURE_PREFIX.length + Math.ceil((SIGNATURE_MAX_BYTES * 4) / 3) + 4, "That signature image is too large");

const signerFields = {
  name: z.string().trim().min(2, "Enter your full name").max(120, "Keep the name under 120 characters"),
  method: z.enum(SIGNATURE_METHODS),
  signature: signatureImageSchema,
  agree: z.literal(true, { error: "Please tick the box to confirm" }),
};

/** Counter-signature by the agency (signed-in owner or admin). */
export const agencySignSchema = z.object(signerFields);
export type AgencySignInput = z.infer<typeof agencySignSchema>;

/** Signature by the client on the public page. */
export const clientSignSchema = z.object({
  ...signerFields,
  email: z.union([z.literal(""), z.email("Enter a valid email").max(254)]),
  /** Fingerprint of the text the signer was shown – the server refuses to sign anything else. */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ClientSignInput = z.infer<typeof clientSignSchema>;
