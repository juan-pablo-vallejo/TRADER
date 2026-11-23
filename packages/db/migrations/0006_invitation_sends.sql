CREATE TABLE "invitation_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"outcome" text NOT NULL,
	"failure" text,
	"provider_message_id" text,
	"sent_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_sends_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invitation_sends_channel" CHECK ("invitation_sends"."channel" IN ('text', 'email')),
	CONSTRAINT "invitation_sends_outcome" CHECK ("invitation_sends"."outcome" IN ('sent', 'failed')),
	CONSTRAINT "invitation_sends_outcome_facts" CHECK (("invitation_sends"."outcome" = 'failed') = ("invitation_sends"."failure" IS NOT NULL) AND ("invitation_sends"."outcome" = 'sent' OR "invitation_sends"."provider_message_id" IS NULL) AND ("invitation_sends"."channel" = 'email' OR ("invitation_sends"."outcome" = 'sent' AND "invitation_sends"."provider_message_id" IS NULL))),
	CONSTRAINT "invitation_sends_failure_code" CHECK ("invitation_sends"."failure" ~ '^[a-z_]+$'),
	CONSTRAINT "invitation_sends_recipient_shape" CHECK (("invitation_sends"."channel" = 'email' AND "invitation_sends"."recipient" = lower(btrim("invitation_sends"."recipient")) AND "invitation_sends"."recipient" ~ '^[^@[:space:]]+@[^@[:space:]]+$') OR ("invitation_sends"."channel" = 'text' AND "invitation_sends"."recipient" ~ '^\+1[2-9][0-9]{9}$'))
);
--> statement-breakpoint
ALTER TABLE "invitation_sends" ADD CONSTRAINT "invitation_sends_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_sends" ADD CONSTRAINT "invitation_sends_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_sends" ADD CONSTRAINT "invitation_sends_company_id_sent_by_user_id_fk" FOREIGN KEY ("company_id","sent_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_sends_user_id_idx" ON "invitation_sends" USING btree ("user_id");--> statement-breakpoint
-- Hand-written from here (drizzle-kit sees no trigger, policy or grant). The record of an
-- invitation's sends is kept as the invoice's is: a row is written once and never changed,
-- one company's rows are that company's alone, and the application may read and add.
CREATE TRIGGER invitation_sends_no_update BEFORE UPDATE ON invitation_sends FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invitation_sends_no_delete BEFORE DELETE ON invitation_sends FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invitation_sends_no_truncate BEFORE TRUNCATE ON invitation_sends FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
ALTER TABLE invitation_sends ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitation_sends FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitation_sends_tenant ON invitation_sends TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
GRANT SELECT, INSERT ON invitation_sends TO trader_app;
