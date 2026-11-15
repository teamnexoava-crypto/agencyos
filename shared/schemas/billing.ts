import { z } from "zod";
import { BILLING_CYCLES, PLAN_IDS } from "../plans";

export const checkoutSchema = z.object({
  plan: z.enum(PLAN_IDS),
  cycle: z.enum(BILLING_CYCLES),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Starting monthly auto-pay for a plan. */
export const subscribeSchema = z.object({ plan: z.enum(PLAN_IDS) });
export type SubscribeInput = z.infer<typeof subscribeSchema>;

/** Dodo sends the payer back to the address we gave it, which carries our own payment id. */
export const dodoCallbackQuery = z.object({
  ref: z.string().regex(/^[A-Za-z0-9_-]{21}$/),
});

/** What Razorpay appends to our address when it sends the payer back. Only the link id is used. */
export const paymentCallbackQuery = z.object({
  razorpay_payment_link_id: z.string().regex(/^plink_[A-Za-z0-9]{6,40}$/),
});
