import { z } from "zod";
import { optionalText } from "./common";

/**
 * An Indian mobile number typed without the country code ("98765 43210", "098765 43210",
 * "919876543210") becomes "+91 98765 43210". Anything else is left as typed.
 */
export function normaliseWhatsapp(value: string): string {
  const digits = value.replace(/[\s()-]/g, "");
  const indian = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  return indian?.[1] ? `+91 ${indian[1].slice(0, 5)} ${indian[1].slice(5)}` : value;
}

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(120, "Keep the name under 120 characters"),
  company: optionalText(120),
  email: z.union([z.literal(""), z.email("Enter a valid email address").max(200)]),
  /** WhatsApp number with country code, e.g. "+91 98765 43210". A 10-digit Indian mobile gets +91 added. */
  whatsapp: z
    .string()
    .trim()
    .max(24, "That number looks too long")
    .transform(normaliseWhatsapp)
    .refine((v) => v === "" || /^\+[1-9][0-9 ()-]{6,20}$/.test(v), "Enter a 10-digit mobile number, or include the country code, e.g. +1 415 555 0100"),
  gstNumber: optionalText(20).toUpperCase(),
  address: optionalText(500),
  notes: optionalText(2000),
});
export type ClientInput = z.infer<typeof clientSchema>;

export const clientUpdateSchema = clientSchema.partial();
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
