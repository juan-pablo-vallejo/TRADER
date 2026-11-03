CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"logged_by_user_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"cost_cents" integer,
	"currency" text,
	"logged_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "materials_company_id_job_id_id_unique" UNIQUE("company_id","job_id","id"),
	CONSTRAINT "materials_id_v7" CHECK (uuid_extract_version("materials"."id") = 7),
	CONSTRAINT "materials_description_not_blank" CHECK (btrim("materials"."description") <> ''),
	CONSTRAINT "materials_quantity_positive" CHECK ("materials"."quantity" > 0),
	CONSTRAINT "materials_unit_not_blank" CHECK (btrim("materials"."unit") <> ''),
	CONSTRAINT "materials_cost_cents_nonnegative" CHECK ("materials"."cost_cents" >= 0),
	CONSTRAINT "materials_cost_complete" CHECK (("materials"."cost_cents" IS NULL) = ("materials"."currency" IS NULL)),
	CONSTRAINT "materials_currency_iso_4217" CHECK ("materials"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_company_id_job_id_fk" FOREIGN KEY ("company_id","job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_company_id_logged_by_user_id_fk" FOREIGN KEY ("company_id","logged_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_job_id_logged_at_idx" ON "materials" USING btree ("job_id","logged_at");--> statement-breakpoint
CREATE INDEX "materials_logged_by_user_id_logged_at_idx" ON "materials" USING btree ("logged_by_user_id","logged_at");