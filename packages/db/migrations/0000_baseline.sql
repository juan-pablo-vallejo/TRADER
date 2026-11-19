CREATE TYPE "public"."entry_flag" AS ENUM('offline', 'corrected', 'user_timed', 'location', 'clock_skewed', 'unscheduled');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'complete', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'worker');--> statement-breakpoint
CREATE TYPE "public"."work_session_event_type" AS ENUM('started', 'paused', 'resumed', 'ended', 'voided');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"schedule_enforced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_not_blank" CHECK (btrim("companies"."name") <> ''),
	CONSTRAINT "companies_timezone_not_blank" CHECK (btrim("companies"."timezone") <> '')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"identity_subject" text,
	"email" text,
	"name" text NOT NULL,
	"phone" text,
	"sign_in_phone" text,
	"role" "user_role" DEFAULT 'worker' NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "users_identity_subject_unique" UNIQUE("identity_subject"),
	CONSTRAINT "users_company_id_sign_in_phone_unique" UNIQUE("company_id","sign_in_phone"),
	CONSTRAINT "users_name_not_blank" CHECK (btrim("users"."name") <> ''),
	CONSTRAINT "users_email_not_blank" CHECK (btrim("users"."email") <> ''),
	CONSTRAINT "users_sign_in_address_present" CHECK ("users"."email" IS NOT NULL OR "users"."sign_in_phone" IS NOT NULL),
	CONSTRAINT "users_sign_in_phone_e164" CHECK ("users"."sign_in_phone" ~ '^\+1[2-9][0-9]{9}$')
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"notes" text,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "customers_name_not_blank" CHECK (btrim("customers"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"location_lat" double precision,
	"location_lng" double precision,
	"location_radius_m" integer,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "jobs_company_id_customer_id_id_unique" UNIQUE("company_id","customer_id","id"),
	CONSTRAINT "jobs_name_not_blank" CHECK (btrim("jobs"."name") <> ''),
	CONSTRAINT "jobs_location_complete" CHECK (("jobs"."location_lat" IS NULL) = ("jobs"."location_lng" IS NULL) AND ("jobs"."location_lat" IS NULL) = ("jobs"."location_radius_m" IS NULL)),
	CONSTRAINT "jobs_location_lat_range" CHECK ("jobs"."location_lat" BETWEEN -90 AND 90),
	CONSTRAINT "jobs_location_lng_range" CHECK ("jobs"."location_lng" BETWEEN -180 AND 180),
	CONSTRAINT "jobs_location_radius_m_positive" CHECK ("jobs"."location_radius_m" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"expected_start" time NOT NULL,
	"expected_end" time NOT NULL,
	"copy_id" uuid,
	"locked_at" timestamp with time zone,
	"locked_by_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_assignments_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "job_assignments_exact_shift_unique" UNIQUE("user_id","work_date","job_id","expected_start","expected_end"),
	CONSTRAINT "job_assignments_lock_complete" CHECK (("job_assignments"."locked_at" IS NULL) = ("job_assignments"."locked_by_event_id" IS NULL)),
	CONSTRAINT "job_assignments_end_after_start" CHECK ("job_assignments"."expected_end" > "job_assignments"."expected_start")
);
--> statement-breakpoint
CREATE TABLE "work_session_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"type" "work_session_event_type" NOT NULL,
	"client_timestamp" timestamp with time zone NOT NULL,
	"server_timestamp" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"clock_skewed" boolean NOT NULL,
	"clock_skew_ms" bigint NOT NULL,
	"location_lat" double precision,
	"location_lng" double precision,
	"location_accuracy_m" double precision,
	"schema_version" smallint NOT NULL,
	"voids_event_id" uuid,
	"corrects_event_id" uuid,
	"time_set_by_user" boolean NOT NULL,
	"captured_offline" boolean NOT NULL,
	"initiator_user_id" uuid NOT NULL,
	"flags" "entry_flag"[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "work_session_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "work_session_events_id_v7" CHECK (uuid_extract_version("work_session_events"."id") = 7),
	CONSTRAINT "work_session_events_location_complete" CHECK (("work_session_events"."location_lat" IS NULL) = ("work_session_events"."location_lng" IS NULL)),
	CONSTRAINT "work_session_events_location_accuracy_with_fix" CHECK ("work_session_events"."location_accuracy_m" IS NULL OR "work_session_events"."location_lat" IS NOT NULL),
	CONSTRAINT "work_session_events_location_lat_range" CHECK ("work_session_events"."location_lat" BETWEEN -90 AND 90),
	CONSTRAINT "work_session_events_location_lng_range" CHECK ("work_session_events"."location_lng" BETWEEN -180 AND 180),
	CONSTRAINT "work_session_events_location_accuracy_m_nonnegative" CHECK ("work_session_events"."location_accuracy_m" >= 0),
	CONSTRAINT "work_session_events_schema_version_positive" CHECK ("work_session_events"."schema_version" >= 1),
	CONSTRAINT "work_session_events_voids_not_self" CHECK ("work_session_events"."voids_event_id" <> "work_session_events"."id"),
	CONSTRAINT "work_session_events_corrects_not_self" CHECK ("work_session_events"."corrects_event_id" <> "work_session_events"."id")
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"next_invoice_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_counters_next_invoice_number_positive" CHECK ("invoice_counters"."next_invoice_number" > 0)
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
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text,
	"unit_price_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_items_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_line_items_position_nonnegative" CHECK ("invoice_line_items"."position" >= 0),
	CONSTRAINT "invoice_line_items_description_not_blank" CHECK (btrim("invoice_line_items"."description") <> ''),
	CONSTRAINT "invoice_line_items_quantity_positive" CHECK ("invoice_line_items"."quantity" > 0),
	CONSTRAINT "invoice_line_items_unit_not_blank" CHECK (btrim("invoice_line_items"."unit") <> ''),
	CONSTRAINT "invoice_line_items_unit_price_cents_nonnegative" CHECK ("invoice_line_items"."unit_price_cents" >= 0),
	CONSTRAINT "invoice_line_items_amount_is_quantity_times_price" CHECK ("invoice_line_items"."amount_cents" = round("invoice_line_items"."quantity" * "invoice_line_items"."unit_price_cents"))
);
--> statement-breakpoint
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
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_customer_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_job_id_fk" FOREIGN KEY ("company_id","job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_locked_by_event_id_fk" FOREIGN KEY ("company_id","locked_by_event_id") REFERENCES "public"."work_session_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_worker_id_fk" FOREIGN KEY ("company_id","worker_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_job_id_fk" FOREIGN KEY ("company_id","job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_initiator_user_id_fk" FOREIGN KEY ("company_id","initiator_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_voids_event_id_fk" FOREIGN KEY ("company_id","voids_event_id") REFERENCES "public"."work_session_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_corrects_event_id_fk" FOREIGN KEY ("company_id","corrects_event_id") REFERENCES "public"."work_session_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_customer_id_job_id_fk" FOREIGN KEY ("company_id","customer_id","job_id") REFERENCES "public"."jobs"("company_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_issued_by_user_id_fk" FOREIGN KEY ("company_id","issued_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_voided_by_user_id_fk" FOREIGN KEY ("company_id","voided_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_company_id_invoice_id_currency_fk" FOREIGN KEY ("company_id","invoice_id","currency") REFERENCES "public"."invoices"("company_id","id","currency") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_invoice_id_currency_fk" FOREIGN KEY ("company_id","invoice_id","currency") REFERENCES "public"."invoices"("company_id","id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_recorded_by_user_id_fk" FOREIGN KEY ("company_id","recorded_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_reverses_payment_id_fk" FOREIGN KEY ("company_id","reverses_payment_id") REFERENCES "public"."invoice_payments"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sends" ADD CONSTRAINT "invoice_sends_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sends" ADD CONSTRAINT "invoice_sends_company_id_invoice_id_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "public"."invoices"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sends" ADD CONSTRAINT "invoice_sends_company_id_sent_by_user_id_fk" FOREIGN KEY ("company_id","sent_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_company_id_lower_email_idx" ON "users" USING btree ("company_id",lower("email"));--> statement-breakpoint
CREATE INDEX "jobs_company_id_status_idx" ON "jobs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "jobs_customer_id_idx" ON "jobs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "job_assignments_company_id_copy_id_idx" ON "job_assignments" USING btree ("company_id","copy_id");--> statement-breakpoint
CREATE INDEX "job_assignments_company_id_work_date_idx" ON "job_assignments" USING btree ("company_id","work_date");--> statement-breakpoint
CREATE INDEX "work_session_events_worker_id_client_timestamp_idx" ON "work_session_events" USING btree ("worker_id","client_timestamp");--> statement-breakpoint
CREATE INDEX "work_session_events_job_id_client_timestamp_idx" ON "work_session_events" USING btree ("job_id","client_timestamp");--> statement-breakpoint
CREATE INDEX "invoices_company_id_issued_at_idx" ON "invoices" USING btree ("company_id","issued_at");--> statement-breakpoint
CREATE INDEX "invoices_job_id_idx" ON "invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_id_position_idx" ON "invoice_line_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_id_idx" ON "invoice_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_sends_invoice_id_idx" ON "invoice_sends" USING btree ("invoice_id");
--> statement-breakpoint
-- Everything below is hand-written: drizzle-kit sees tables, enums, constraints and indexes
-- only. Later migrations that add a trigger, a function, a policy or a grant are
-- `drizzle-kit generate --custom` files.
--
-- The application's runtime role. Created here, in SQL, never through the Neon console, CLI
-- or API: those make a role a member of neon_superuser, which has BYPASSRLS. Roles are
-- cluster-wide, so a database migrated on a server that already has the role finds it and
-- moves on. No password in the repository: the owner sets it once per environment with
-- ALTER ROLE trader_app PASSWORD. NOINHERIT: it gains nothing from any role it is later
-- granted. Attributes are stated only at creation; an existing role's drift is the startup
-- check's to catch (src/guard.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trader_app') THEN
    CREATE ROLE trader_app LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO trader_app;
--> statement-breakpoint
-- The settings a request carries, each read in one place. current_setting(..., true) is NULL
-- when the setting was never set in the session, but '' once any earlier transaction set it
-- locally, and ''::uuid raises 22P02; nullif maps both to NULL. company_id = NULL is never
-- true, so a request that forgot the tenant reads zero rows and writes none: fail closed.
CREATE FUNCTION app_company_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT nullif(current_setting('app.company_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE FUNCTION app_identity_subject() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT nullif(current_setting('app.identity_subject', true), '')
$$;
--> statement-breakpoint
CREATE FUNCTION app_identity_email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT nullif(current_setting('app.identity_email', true), '')
$$;
--> statement-breakpoint
CREATE FUNCTION app_identity_phone() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT nullif(current_setting('app.identity_phone', true), '')
$$;
--> statement-breakpoint
-- Invariant 1: a clock event is never edited or deleted. UPDATE, DELETE and TRUNCATE are
-- refused for every role, the table's owner included; a fix is a new event pointing at the
-- old one. Payments and sends are append-only the same way.
CREATE FUNCTION reject_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'integrity_constraint_violation',
    MESSAGE = format('%s is append-only: %s rejected', TG_TABLE_NAME, TG_OP),
    HINT = 'Record a correcting event instead.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_session_events_no_update BEFORE UPDATE ON work_session_events FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER work_session_events_no_delete BEFORE DELETE ON work_session_events FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER work_session_events_no_truncate BEFORE TRUNCATE ON work_session_events FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_payments_no_update BEFORE UPDATE ON invoice_payments FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_payments_no_delete BEFORE DELETE ON invoice_payments FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_payments_no_truncate BEFORE TRUNCATE ON invoice_payments FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_sends_no_update BEFORE UPDATE ON invoice_sends FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_sends_no_delete BEFORE DELETE ON invoice_sends FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_sends_no_truncate BEFORE TRUNCATE ON invoice_sends FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
-- A void names the `started` event of the session it voids, and corrects nothing.
CREATE FUNCTION check_work_session_event_references() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (NEW.type = 'voided') <> (NEW.voids_event_id IS NOT NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'work_session_events: voids_event_id is set exactly when type is voided',
      CONSTRAINT = 'work_session_events_void_reference';
  END IF;
  IF NEW.type = 'voided' AND NEW.corrects_event_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'work_session_events: a voided event corrects nothing',
      CONSTRAINT = 'work_session_events_void_corrects_nothing';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_session_events_check_references BEFORE INSERT ON work_session_events FOR EACH ROW EXECUTE FUNCTION check_work_session_event_references();
--> statement-breakpoint
-- Invariant 6: an invoice is born a draft, takes the next number of its company's series at
-- issue (under the counter row's lock, so numbers have no gaps and an aborted issue gives its
-- number back), and from then never changes but to be voided once. Its lines are frozen with
-- it. A cascaded DELETE reaches the line trigger after the draft is gone, so a missing parent
-- is permitted there.
CREATE FUNCTION check_invoice_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  frozen_old jsonb;
  frozen_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.issued_at IS NOT NULL OR NEW.number IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: every invoice is born a draft and issued by UPDATE',
        CONSTRAINT = 'invoices_born_draft';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.issued_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: an issued invoice is never deleted; void it',
        CONSTRAINT = 'invoices_issued_never_deleted';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: the issue transition.
  IF OLD.issued_at IS NULL AND NEW.issued_at IS NOT NULL THEN
    -- Issuing changes nothing else: the customer, job, currency and tax that are issued are
    -- the ones the draft held, and an issue is never a void in the same statement.
    frozen_old := to_jsonb(OLD) - 'issued_at' - 'issued_by_user_id' - 'number' - 'updated_at';
    frozen_new := to_jsonb(NEW) - 'issued_at' - 'issued_by_user_id' - 'number' - 'updated_at';
    IF frozen_old <> frozen_new THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: issuing changes nothing but the issue itself, and is never a void',
        CONSTRAINT = 'invoices_issue_alone';
    END IF;
    IF NEW.number IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: the number is assigned at issue, never supplied',
        CONSTRAINT = 'invoices_number_assigned';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM invoice_line_items l
                   WHERE l.company_id = NEW.company_id AND l.invoice_id = NEW.id) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: an invoice issues with at least one line',
        CONSTRAINT = 'invoices_issued_has_lines';
    END IF;
    UPDATE invoice_counters
      SET next_invoice_number = next_invoice_number + 1, updated_at = now()
      WHERE company_id = NEW.company_id
      RETURNING next_invoice_number - 1 INTO NEW.number;
    IF NEW.number IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: the company has no number series; create its invoice_counters row',
        CONSTRAINT = 'invoices_counter_missing';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE of an issued row: only the void transition, once.
  IF OLD.issued_at IS NOT NULL THEN
    frozen_old := to_jsonb(OLD) - 'voided_at' - 'voided_by_user_id' - 'updated_at';
    frozen_new := to_jsonb(NEW) - 'voided_at' - 'voided_by_user_id' - 'updated_at';
    IF frozen_old <> frozen_new OR OLD.voided_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: an issued invoice is immutable; the only change is to void it once',
        CONSTRAINT = 'invoices_issued_frozen';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_check_mutation BEFORE INSERT OR DELETE OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION check_invoice_mutation();
--> statement-breakpoint
CREATE FUNCTION check_invoice_line_item_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent_issued_at timestamptz;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT i.issued_at INTO parent_issued_at FROM invoices i
      WHERE i.id = OLD.invoice_id FOR SHARE;
    IF parent_issued_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = format('invoice_line_items: the invoice is issued; %s rejected', TG_OP),
        CONSTRAINT = 'invoice_line_items_invoice_frozen';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT i.issued_at INTO parent_issued_at FROM invoices i
      WHERE i.id = NEW.invoice_id FOR SHARE;
    IF parent_issued_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = format('invoice_line_items: the invoice is issued; %s rejected', TG_OP),
        CONSTRAINT = 'invoice_line_items_invoice_frozen';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_line_items_check_mutation BEFORE INSERT OR DELETE OR UPDATE ON invoice_line_items FOR EACH ROW EXECUTE FUNCTION check_invoice_line_item_mutation();
--> statement-breakpoint
-- A payment is against an issued invoice that is not void, and payments never total more
-- than the invoice; a reversal names a payment of the same invoice for its amount. A send is
-- of an issued invoice that is not void. Each looks its parent up inside the row's own
-- company: a BEFORE trigger answers before the foreign key does.
CREATE FUNCTION check_invoice_payment_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  inv record;
  target record;
  standing bigint;
  total bigint;
BEGIN
  SELECT i.issued_at, i.voided_at, i.tax_cents INTO inv FROM invoices i
    WHERE i.company_id = NEW.company_id AND i.id = NEW.invoice_id FOR NO KEY UPDATE;
  -- An invoice that is missing, or another company's, is the foreign key's to refuse.
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF inv.issued_at IS NULL OR inv.voided_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'invoice_payments: a payment is against an issued invoice that is not void',
      CONSTRAINT = 'invoice_payments_invoice_issued';
  END IF;
  IF NEW.reverses_payment_id IS NOT NULL THEN
    SELECT p.invoice_id, p.amount_cents, p.reverses_payment_id INTO target
      FROM invoice_payments p
      WHERE p.company_id = NEW.company_id AND p.id = NEW.reverses_payment_id;
    IF FOUND AND (target.invoice_id <> NEW.invoice_id
        OR target.reverses_payment_id IS NOT NULL
        OR target.amount_cents <> NEW.amount_cents) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoice_payments: a reversal names a payment of the same invoice, for its amount',
        CONSTRAINT = 'invoice_payments_reversal';
    END IF;
    RETURN NEW;
  END IF;
  SELECT coalesce(sum(p.amount_cents), 0) INTO standing FROM invoice_payments p
    WHERE p.invoice_id = NEW.invoice_id AND p.reverses_payment_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM invoice_payments r WHERE r.reverses_payment_id = p.id);
  SELECT coalesce(sum(l.amount_cents), 0) + inv.tax_cents INTO total FROM invoice_line_items l
    WHERE l.invoice_id = NEW.invoice_id;
  IF standing + NEW.amount_cents > total THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'invoice_payments: payments never total more than the invoice',
      CONSTRAINT = 'invoice_payments_not_overpaid';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_payments_check_insert BEFORE INSERT ON invoice_payments FOR EACH ROW EXECUTE FUNCTION check_invoice_payment_insert();
--> statement-breakpoint
CREATE FUNCTION check_invoice_send_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  inv record;
BEGIN
  SELECT i.issued_at, i.voided_at INTO inv FROM invoices i
    WHERE i.company_id = NEW.company_id AND i.id = NEW.invoice_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF inv.issued_at IS NULL OR inv.voided_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'invoice_sends: a send is of an issued invoice that is not void',
      CONSTRAINT = 'invoice_sends_invoice_issued';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_sends_check_insert BEFORE INSERT ON invoice_sends FOR EACH ROW EXECUTE FUNCTION check_invoice_send_insert();
--> statement-breakpoint
-- A shift is created unlocked; its company, person and job never change; once a clock-in has
-- locked it, it keeps its day, its times and its lock and is never removed. The lock names a
-- `started` event of the shift's own person on its own job.
CREATE FUNCTION check_job_assignment_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.locked_at IS NOT NULL OR NEW.locked_by_event_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'job_assignments: a shift is created unlocked',
      CONSTRAINT = 'job_assignments_created_unlocked';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_assignments_check_insert BEFORE INSERT ON job_assignments FOR EACH ROW EXECUTE FUNCTION check_job_assignment_insert();
--> statement-breakpoint
CREATE FUNCTION check_job_assignment_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  ev record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a shift locked by a clock-in is never removed',
        CONSTRAINT = 'job_assignments_locked';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.user_id <> OLD.user_id
     OR NEW.job_id <> OLD.job_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'job_assignments: a shift''s company, person and job never change',
      CONSTRAINT = 'job_assignments_identity';
  END IF;
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.work_date <> OLD.work_date OR NEW.expected_start <> OLD.expected_start
       OR NEW.expected_end <> OLD.expected_end
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.locked_by_event_id IS DISTINCT FROM OLD.locked_by_event_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a shift locked by a clock-in keeps its day, its times and its lock',
        CONSTRAINT = 'job_assignments_locked';
    END IF;
  ELSIF NEW.locked_at IS NOT NULL THEN
    SELECT e.type, e.worker_id, e.job_id INTO ev FROM work_session_events e
      WHERE e.id = NEW.locked_by_event_id;
    IF NOT FOUND OR ev.type <> 'started' OR ev.worker_id <> NEW.user_id
       OR ev.job_id <> NEW.job_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a shift is locked by a clock-in of its own person on its own job',
        CONSTRAINT = 'job_assignments_lock_event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_assignments_check_mutation BEFORE DELETE OR UPDATE ON job_assignments FOR EACH ROW EXECUTE FUNCTION check_job_assignment_mutation();
--> statement-breakpoint
CREATE FUNCTION check_job_assignment_truncate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM job_assignments WHERE locked_at IS NOT NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'job_assignments: a shift locked by a clock-in is never removed',
      CONSTRAINT = 'job_assignments_locked';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_assignments_check_truncate BEFORE TRUNCATE ON job_assignments FOR EACH STATEMENT EXECUTE FUNCTION check_job_assignment_truncate();
--> statement-breakpoint
-- A sign-in binds one invited row by writing its identity_subject, alone, and under a
-- sign-in identity that is the only update permitted.
CREATE FUNCTION guard_user_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.identity_subject IS DISTINCT FROM OLD.identity_subject THEN
    IF OLD.identity_subject IS NULL
      AND NEW.identity_subject = public.app_identity_subject()
      AND public.app_company_id() IS NULL
      AND (to_jsonb(NEW) - 'identity_subject' - 'updated_at')
        = (to_jsonb(OLD) - 'identity_subject' - 'updated_at')
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'users: identity_subject changes only by binding an invited row, alone';
  END IF;
  IF public.app_identity_subject() IS NOT NULL
    OR public.app_identity_email() IS NOT NULL
    OR public.app_identity_phone() IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'users: under a sign-in identity the only permitted update is the bind';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_identity_guard BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_user_identity();
--> statement-breakpoint
-- Invariant 5: every row belongs to one company, and Postgres enforces it. One policy per
-- table, FOR ALL, USING equal to WITH CHECK, so a row can neither be read nor written nor
-- moved outside the tenant. FORCE so the owner obeys it too unless it bypasses row security
-- by attribute: the owner is the migrator, never the runtime role. With FORCE and no policy
-- for a role, that role sees no row. A table added later with a company_id needs its own
-- three statements; the inventory test and the startup check read the catalog.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY companies_tenant ON companies TO trader_app USING ((id = public.app_company_id())) WITH CHECK ((id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_tenant ON users TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customers_tenant ON customers TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY jobs_tenant ON jobs TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE job_assignments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY job_assignments_tenant ON job_assignments TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE work_session_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE work_session_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY work_session_events_tenant ON work_session_events TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoice_counters FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_counters_tenant ON invoice_counters TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoices_tenant ON invoices TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoice_line_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_line_items_tenant ON invoice_line_items TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoice_payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_payments_tenant ON invoice_payments TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
ALTER TABLE invoice_sends ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoice_sends FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_sends_tenant ON invoice_sends TO trader_app USING ((company_id = public.app_company_id())) WITH CHECK ((company_id = public.app_company_id()));
--> statement-breakpoint
-- First sign-in: with the tenant unset and an identity set, a caller sees its own bound row
-- or the unbound invitations to its verified email or number, and may bind one.
CREATE POLICY users_identity_select ON users FOR SELECT TO trader_app USING (((identity_subject = public.app_identity_subject()) OR ((identity_subject IS NULL) AND (lower(email) = lower(public.app_identity_email())))));
--> statement-breakpoint
CREATE POLICY users_identity_bind ON users FOR UPDATE TO trader_app USING (((identity_subject IS NULL) AND (lower(email) = lower(public.app_identity_email())))) WITH CHECK ((identity_subject = public.app_identity_subject()));
--> statement-breakpoint
CREATE POLICY users_identity_select_phone ON users FOR SELECT TO trader_app USING (((identity_subject IS NULL) AND (sign_in_phone = public.app_identity_phone())));
--> statement-breakpoint
CREATE POLICY users_identity_bind_phone ON users FOR UPDATE TO trader_app USING (((identity_subject IS NULL) AND (sign_in_phone = public.app_identity_phone()))) WITH CHECK ((identity_subject = public.app_identity_subject()));
--> statement-breakpoint
-- Per table, and stated again by every migration that adds one: no default privileges, so an
-- append-only table never inherits UPDATE. TRUNCATE is granted nowhere. DELETE only where the
-- domain deletes: a draft invoice and its lines, a shift. The company row and its counter row
-- are created by onboarding as the owner. Of a company's columns the application writes its
-- name and zone only: schedule_enforced is the owner's.
GRANT SELECT ON companies TO trader_app;
--> statement-breakpoint
GRANT UPDATE (name, timezone, updated_at) ON companies TO trader_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON invoice_counters TO trader_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON users, customers, jobs TO trader_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON job_assignments, invoices, invoice_line_items TO trader_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON work_session_events, invoice_payments, invoice_sends TO trader_app;
