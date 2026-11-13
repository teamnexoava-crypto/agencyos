import { z } from "zod";
import { optionalText } from "./common";

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(120, "Keep the name under 120 characters"),
  company: optionalText(120),
  email: z.union([z.literal(""), z.email("Enter a valid email address").max(200)]),
  /** WhatsApp number including country code, e.g. "+91 98765 43210". */
  whatsapp: z
    .string()
    .trim()
    .max(24, "That number looks too long")
    .refine((v) => v === "" || /^\+[1-9][0-9 ()-]{6,20}$/.test(v), "Include the country code, e.g. +91 98765 43210"),
  gstNumber: optionalText(20).toUpperCase(),
  address: optionalText(500),
  notes: optionalText(2000),
});
export type ClientInput = z.infer<typeof clientSchema>;

export const clientUpdateSchema = clientSchema.partial();
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
