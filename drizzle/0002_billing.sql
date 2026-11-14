CREATE TABLE "billing_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"plan" text NOT NULL,
	"cycle" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"provider_link_id" text,
	"provider_link_url" text,
	"provider_payment_id" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_by" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "trial_ends_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "paid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_created_by_workspace_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."workspace_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_payments_ws_idx" ON "billing_payments" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payments_link_uq" ON "billing_payments" USING btree ("provider_link_id");