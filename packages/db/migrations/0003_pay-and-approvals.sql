CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approval_reason" AS ENUM('offline', 'corrected', 'user_timed', 'location', 'clock_skewed');--> statement-breakpoint
ALTER TYPE "public"."work_session_event_type" ADD VALUE 'voided';--> statement-breakpoint
CREATE TABLE "pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_periods_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "pay_periods_ends_on_after_starts_on" CHECK ("pay_periods"."ends_on" >= "pay_periods"."starts_on"),
	CONSTRAINT "pay_periods_closed_complete" CHECK (("pay_periods"."closed_at" IS NULL) = ("pay_periods"."closed_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "pay_rates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"hourly_rate_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_rates_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "pay_rates_company_id_user_id_effective_from_unique" UNIQUE("company_id","user_id","effective_from"),
	CONSTRAINT "pay_rates_hourly_rate_cents_nonnegative" CHECK ("pay_rates"."hourly_rate_cents" >= 0),
	CONSTRAINT "pay_rates_currency_iso_4217" CHECK ("pay_rates"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"reasons" "approval_reason"[] NOT NULL,
	"decision" "approval_decision",
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "approvals_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "approvals_reasons_not_empty" CHECK (cardinality("approvals"."reasons") >= 1),
	CONSTRAINT "approvals_decision_complete" CHECK (("approvals"."decision" IS NULL) = ("approvals"."decided_at" IS NULL) AND ("approvals"."decision" IS NULL) = ("approvals"."decided_by_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "work_session_events" ADD COLUMN "voids_event_id" uuid;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD COLUMN "corrects_event_id" uuid;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD COLUMN "time_set_by_user" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD COLUMN "initiator_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_company_id_closed_by_user_id_fk" FOREIGN KEY ("company_id","closed_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_rates" ADD CONSTRAINT "pay_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_rates" ADD CONSTRAINT "pay_rates_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_company_id_event_id_fk" FOREIGN KEY ("company_id","event_id") REFERENCES "public"."work_session_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_company_id_decided_by_user_id_fk" FOREIGN KEY ("company_id","decided_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_queue_idx" ON "approvals" USING btree ("company_id","created_at") WHERE "approvals"."decision" IS NULL;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_initiator_user_id_fk" FOREIGN KEY ("company_id","initiator_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_voids_event_id_fk" FOREIGN KEY ("company_id","voids_event_id") REFERENCES "public"."work_session_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_corrects_event_id_fk" FOREIGN KEY ("company_id","corrects_event_id") REFERENCES "public"."work_session_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_voids_not_self" CHECK ("work_session_events"."voids_event_id" <> "work_session_events"."id");--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_corrects_not_self" CHECK ("work_session_events"."corrects_event_id" <> "work_session_events"."id");