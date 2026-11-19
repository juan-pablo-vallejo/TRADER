ALTER TABLE "companies" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "payment_instructions" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_terms_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "location_stamps" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_stamps" boolean;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_invoice_terms_days_range" CHECK ("companies"."invoice_terms_days" BETWEEN 0 AND 365);--> statement-breakpoint
-- Hand-written from here (drizzle-kit sees no grant). The application role writes what an
-- admin sets in Settings: the details an invoice prints, the terms, and the two switches.
-- schedule_enforced was the owner's alone until now. The zone stays as the baseline left it.
GRANT UPDATE (address, phone, email, payment_instructions, invoice_terms_days, location_stamps, schedule_enforced) ON companies TO trader_app;
