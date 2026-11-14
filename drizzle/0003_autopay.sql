CREATE TABLE "billing_provider_plans" (
	"key" text PRIMARY KEY NOT NULL,
	"provider_plan_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_provider_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"plan" text NOT NULL,
	"cycle" text DEFAULT 'monthly' NOT NULL,
	"amount" bigint NOT NULL,
	"provider_subscription_id" text,
	"provider_plan_id" text,
	"short_url" text,
	"status" text DEFAULT 'created' NOT NULL,
	"paid_count" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp with time zone,
	"next_charge_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"created_by" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD COLUMN "cycle_no" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_created_by_workspace_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."workspace_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_subscriptions_ws_idx" ON "billing_subscriptions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_provider_uq" ON "billing_subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payments_charge_uq" ON "billing_payments" USING btree ("subscription_id","cycle_no");