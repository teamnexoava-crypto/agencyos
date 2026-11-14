CREATE TABLE "app_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "basis" text;