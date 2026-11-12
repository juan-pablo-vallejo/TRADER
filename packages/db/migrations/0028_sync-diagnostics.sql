CREATE TABLE "sync_diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"record_id" uuid,
	"record_kind" text,
	"outcome" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_diagnostics_outcome" CHECK ("sync_diagnostics"."outcome" IN ('rejected', 'omitted', 'request_failed')),
	CONSTRAINT "sync_diagnostics_code_format" CHECK ("sync_diagnostics"."code" ~ '^[a-z_]{1,64}$'),
	CONSTRAINT "sync_diagnostics_record_kind_format" CHECK ("sync_diagnostics"."record_kind" IS NULL OR "sync_diagnostics"."record_kind" ~ '^[a-z_]{1,40}$'),
	CONSTRAINT "sync_diagnostics_request_failed_has_no_record" CHECK ("sync_diagnostics"."outcome" <> 'request_failed' OR ("sync_diagnostics"."record_id" IS NULL AND "sync_diagnostics"."record_kind" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "sync_diagnostics" ADD CONSTRAINT "sync_diagnostics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_diagnostics" ADD CONSTRAINT "sync_diagnostics_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_diagnostics_company_id_record_id_code_unique" ON "sync_diagnostics" USING btree ("company_id","record_id","code") WHERE "sync_diagnostics"."record_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sync_diagnostics_company_id_user_id_created_at_idx" ON "sync_diagnostics" USING btree ("company_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "sync_diagnostics_company_id_created_at_idx" ON "sync_diagnostics" USING btree ("company_id","created_at");