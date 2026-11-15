CREATE TABLE "email_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"to_email" text NOT NULL,
	"provider_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_log_once_uq" ON "email_log" USING btree ("workspace_id","kind","key");