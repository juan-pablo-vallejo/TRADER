CREATE TABLE "invoice_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"outcome" text NOT NULL,
	"failure" text,
	"provider_message_id" text,
	"sent_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_sends_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_sends_outcome" CHECK ("invoice_sends"."outcome" IN ('sent', 'failed')),
	CONSTRAINT "invoice_sends_outcome_facts" CHECK (("invoice_sends"."outcome" = 'failed') = ("invoice_sends"."failure" IS NOT NULL) AND ("invoice_sends"."outcome" = 'sent' OR "invoice_sends"."provider_message_id" IS NULL)),
	CONSTRAINT "invoice_sends_failure_code" CHECK ("invoice_sends"."failure" ~ '^[a-z_]+$'),
	CONSTRAINT "invoice_sends_recipient_shape" CHECK ("invoice_sends"."recipient" = lower(btrim("invoice_sends"."recipient")) AND "invoice_sends"."recipient" ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);
--> statement-breakpoint
ALTER TABLE "invoice_sends" ADD CONSTRAINT "invoice_sends_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sends" ADD CONSTRAINT "invoice_sends_company_id_invoice_id_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "public"."invoices"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sends" ADD CONSTRAINT "invoice_sends_company_id_sent_by_user_id_fk" FOREIGN KEY ("company_id","sent_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_sends_invoice_id_idx" ON "invoice_sends" USING btree ("invoice_id");