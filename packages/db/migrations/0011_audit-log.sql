CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_table" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "audit_log_action_format" CHECK ("audit_log"."action" ~ '^[a-z_]+\.[a-z_]+$'),
	CONSTRAINT "audit_log_action_prefix" CHECK (split_part("audit_log"."action", '.', 1) = "audit_log"."entity_table"),
	CONSTRAINT "audit_log_snapshot_present" CHECK ("audit_log"."before" IS NOT NULL OR "audit_log"."after" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_actor_user_id_fk" FOREIGN KEY ("company_id","actor_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_company_id_created_at_idx" ON "audit_log" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_company_id_entity_table_entity_id_idx" ON "audit_log" USING btree ("company_id","entity_table","entity_id");