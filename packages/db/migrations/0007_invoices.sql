-- The unique first: drizzle-kit emits it last, after the foreign key that needs it.
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_customer_id_id_unique" UNIQUE("company_id","customer_id","id");--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"next_invoice_number" integer NOT NULL,
	"next_credit_memo_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_counters_next_invoice_number_positive" CHECK ("invoice_counters"."next_invoice_number" > 0),
	CONSTRAINT "invoice_counters_next_credit_memo_number_positive" CHECK ("invoice_counters"."next_credit_memo_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"number" integer,
	"currency" text NOT NULL,
	"tax_cents" integer NOT NULL,
	"issued_at" timestamp with time zone,
	"issued_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoices_company_id_id_currency_unique" UNIQUE("company_id","id","currency"),
	CONSTRAINT "invoices_company_id_number_unique" UNIQUE("company_id","number"),
	CONSTRAINT "invoices_number_positive" CHECK ("invoices"."number" > 0),
	CONSTRAINT "invoices_number_with_issue" CHECK (("invoices"."number" IS NULL) = ("invoices"."issued_at" IS NULL)),
	CONSTRAINT "invoices_currency_iso_4217" CHECK ("invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoices_tax_cents_nonnegative" CHECK ("invoices"."tax_cents" >= 0),
	CONSTRAINT "invoices_issued_complete" CHECK (("invoices"."issued_at" IS NULL) = ("invoices"."issued_by_user_id" IS NULL)),
	CONSTRAINT "invoices_voided_complete" CHECK (("invoices"."voided_at" IS NULL) = ("invoices"."voided_by_user_id" IS NULL)),
	CONSTRAINT "invoices_void_after_issue" CHECK ("invoices"."voided_at" IS NULL OR "invoices"."issued_at" IS NOT NULL),
	CONSTRAINT "invoices_void_not_before_issue" CHECK ("invoices"."voided_at" >= "invoices"."issued_at")
);
--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_customer_id_job_id_fk" FOREIGN KEY ("company_id","customer_id","job_id") REFERENCES "public"."jobs"("company_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_issued_by_user_id_fk" FOREIGN KEY ("company_id","issued_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_voided_by_user_id_fk" FOREIGN KEY ("company_id","voided_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_company_id_issued_at_idx" ON "invoices" USING btree ("company_id","issued_at");--> statement-breakpoint
CREATE INDEX "invoices_job_id_idx" ON "invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");
