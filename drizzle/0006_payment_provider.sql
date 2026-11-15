ALTER TABLE "billing_payments" ADD COLUMN "provider" text DEFAULT 'razorpay' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "provider" text DEFAULT 'razorpay' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "checkout_id" text;