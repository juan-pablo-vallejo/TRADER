CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"note" text,
	"reverses_payment_id" uuid,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payments_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_payments_reverses_payment_id_unique" UNIQUE("reverses_payment_id"),
	CONSTRAINT "invoice_payments_amount_cents_positive" CHECK ("invoice_payments"."amount_cents" > 0),
	CONSTRAINT "invoice_payments_method" CHECK ("invoice_payments"."method" IN ('check', 'cash', 'card', 'bank_transfer', 'other')),
	CONSTRAINT "invoice_payments_note_not_blank" CHECK (btrim("invoice_payments"."note") <> '')
);
--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_invoice_id_currency_fk" FOREIGN KEY ("company_id","invoice_id","currency") REFERENCES "public"."invoices"("company_id","id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_recorded_by_user_id_fk" FOREIGN KEY ("company_id","recorded_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_reverses_payment_id_fk" FOREIGN KEY ("company_id","reverses_payment_id") REFERENCES "public"."invoice_payments"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_id_idx" ON "invoice_payments" USING btree ("invoice_id");