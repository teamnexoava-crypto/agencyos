ALTER TABLE "billing_subscriptions" ADD COLUMN "currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_currency" text DEFAULT 'INR' NOT NULL;