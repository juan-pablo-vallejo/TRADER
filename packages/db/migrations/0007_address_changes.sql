CREATE TABLE "address_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "address_changes_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "address_changes_field" CHECK ("address_changes"."field" IN ('email', 'sign_in_phone')),
	CONSTRAINT "address_changes_changed" CHECK ("address_changes"."old_value" IS DISTINCT FROM "address_changes"."new_value"),
	CONSTRAINT "address_changes_not_own" CHECK ("address_changes"."user_id" <> "address_changes"."changed_by_user_id")
);
--> statement-breakpoint
ALTER TABLE "address_changes" ADD CONSTRAINT "address_changes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_changes" ADD CONSTRAINT "address_changes_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_changes" ADD CONSTRAINT "address_changes_company_id_changed_by_user_id_fk" FOREIGN KEY ("company_id","changed_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "address_changes_user_id_idx" ON "address_changes" USING btree ("user_id");--> statement-breakpoint
-- Hand-written from here (drizzle-kit sees no trigger, policy or grant). The record of who
-- changed whose sign-in address is kept as an invitation's sends are: a row is written once
-- and never changed, one company's rows are that company's alone, and the application may
-- read and add.
CREATE TRIGGER address_changes_no_update BEFORE UPDATE ON address_changes FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER address_changes_no_delete BEFORE DELETE ON address_changes FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER address_changes_no_truncate BEFORE TRUNCATE ON address_changes FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
ALTER TABLE address_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE address_changes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY address_changes_tenant ON address_changes TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
GRANT SELECT, INSERT ON address_changes TO trader_app;
