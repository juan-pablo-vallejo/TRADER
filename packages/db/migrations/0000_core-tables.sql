CREATE TYPE "public"."job_status" AS ENUM('open', 'complete', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'foreman', 'worker');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
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
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" "user_role" DEFAULT 'worker' NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "users_identity_subject_unique" UNIQUE("identity_subject"),
	CONSTRAINT "users_name_not_blank" CHECK (btrim("users"."name") <> ''),
	CONSTRAINT "users_email_not_blank" CHECK (btrim("users"."email") <> '')
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"company_id" uuid NOT NULL,
	"crew_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_members_pkey" PRIMARY KEY("crew_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"foreman_user_id" uuid NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crews_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "crews_name_not_blank" CHECK (btrim("crews"."name") <> '')
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
	"crew_id" uuid,
	"name" text NOT NULL,
	"address" text,
	"location_lat" double precision,
	"location_lng" double precision,
	"location_radius_m" integer,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "jobs_name_not_blank" CHECK (btrim("jobs"."name") <> ''),
	CONSTRAINT "jobs_location_complete" CHECK (("jobs"."location_lat" IS NULL) = ("jobs"."location_lng" IS NULL) AND ("jobs"."location_lat" IS NULL) = ("jobs"."location_radius_m" IS NULL)),
	CONSTRAINT "jobs_location_lat_range" CHECK ("jobs"."location_lat" BETWEEN -90 AND 90),
	CONSTRAINT "jobs_location_lng_range" CHECK ("jobs"."location_lng" BETWEEN -180 AND 180),
	CONSTRAINT "jobs_location_radius_m_positive" CHECK ("jobs"."location_radius_m" > 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_company_id_crew_id_fk" FOREIGN KEY ("company_id","crew_id") REFERENCES "public"."crews"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_company_id_foreman_user_id_fk" FOREIGN KEY ("company_id","foreman_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_customer_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_crew_id_fk" FOREIGN KEY ("company_id","crew_id") REFERENCES "public"."crews"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_company_id_lower_email_idx" ON "users" USING btree ("company_id",lower("email"));--> statement-breakpoint
CREATE INDEX "crew_members_user_id_idx" ON "crew_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crews_foreman_user_id_idx" ON "crews" USING btree ("foreman_user_id");--> statement-breakpoint
CREATE INDEX "jobs_company_id_status_idx" ON "jobs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "jobs_customer_id_idx" ON "jobs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "jobs_crew_id_idx" ON "jobs" USING btree ("crew_id");