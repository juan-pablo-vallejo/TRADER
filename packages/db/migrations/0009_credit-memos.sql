CREATE TABLE "credit_memos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"number" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_memos_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "credit_memos_company_id_number_unique" UNIQUE("company_id","number"),
	CONSTRAINT "credit_memos_number_positive" CHECK ("credit_memos"."number" > 0),
	CONSTRAINT "credit_memos_amount_cents_positive" CHECK ("credit_memos"."amount_cents" > 0),
	CONSTRAINT "credit_memos_reason_not_blank" CHECK (btrim("credit_memos"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_company_id_invoice_id_currency_fk" FOREIGN KEY ("company_id","invoice_id","currency") REFERENCES "public"."invoices"("company_id","id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_company_id_issued_by_user_id_fk" FOREIGN KEY ("company_id","issued_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_memos_invoice_id_idx" ON "credit_memos" USING btree ("invoice_id");