CREATE TYPE "public"."attestation_level" AS ENUM('biometric', 'device_credential', 'none');--> statement-breakpoint
CREATE TYPE "public"."work_session_event_type" AS ENUM('started', 'paused', 'resumed', 'ended');--> statement-breakpoint
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
	"attestation_level" "attestation_level" NOT NULL,
	"location_lat" double precision,
	"location_lng" double precision,
	"location_accuracy_m" double precision,
	"schema_version" smallint NOT NULL,
	CONSTRAINT "work_session_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "work_session_events_id_v7" CHECK (uuid_extract_version("work_session_events"."id") = 7),
	CONSTRAINT "work_session_events_location_complete" CHECK (("work_session_events"."location_lat" IS NULL) = ("work_session_events"."location_lng" IS NULL)),
	CONSTRAINT "work_session_events_location_accuracy_with_fix" CHECK ("work_session_events"."location_accuracy_m" IS NULL OR "work_session_events"."location_lat" IS NOT NULL),
	CONSTRAINT "work_session_events_location_lat_range" CHECK ("work_session_events"."location_lat" BETWEEN -90 AND 90),
	CONSTRAINT "work_session_events_location_lng_range" CHECK ("work_session_events"."location_lng" BETWEEN -180 AND 180),
	CONSTRAINT "work_session_events_location_accuracy_m_nonnegative" CHECK ("work_session_events"."location_accuracy_m" >= 0),
	CONSTRAINT "work_session_events_schema_version_positive" CHECK ("work_session_events"."schema_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_worker_id_fk" FOREIGN KEY ("company_id","worker_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_events" ADD CONSTRAINT "work_session_events_company_id_job_id_fk" FOREIGN KEY ("company_id","job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_session_events_worker_id_client_timestamp_idx" ON "work_session_events" USING btree ("worker_id","client_timestamp");--> statement-breakpoint
CREATE INDEX "work_session_events_job_id_client_timestamp_idx" ON "work_session_events" USING btree ("job_id","client_timestamp");