CREATE TABLE "day_closeout_materials" (
	"company_id" uuid NOT NULL,
	"closeout_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	CONSTRAINT "day_closeout_materials_pkey" PRIMARY KEY("closeout_id","material_id"),
	CONSTRAINT "day_closeout_materials_company_id_material_id_unique" UNIQUE("company_id","material_id")
);
--> statement-breakpoint
CREATE TABLE "day_closeout_workers" (
	"company_id" uuid NOT NULL,
	"closeout_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"ledger_through" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "day_closeout_workers_pkey" PRIMARY KEY("closeout_id","worker_id")
);
--> statement-breakpoint
CREATE TABLE "day_closeouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"timezone" text NOT NULL,
	"job_status" "job_status" NOT NULL,
	"job_status_applied" boolean NOT NULL,
	"note" text,
	"submitted_by_user_id" uuid NOT NULL,
	"client_timestamp" timestamp with time zone NOT NULL,
	"server_timestamp" timestamp (3) with time zone NOT NULL,
	"worker_mark_count" integer NOT NULL,
	"material_count" integer NOT NULL,
	CONSTRAINT "day_closeouts_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "day_closeouts_company_id_job_id_work_date_unique" UNIQUE("company_id","job_id","work_date"),
	CONSTRAINT "day_closeouts_company_id_job_id_id_unique" UNIQUE("company_id","job_id","id"),
	CONSTRAINT "day_closeouts_id_v7" CHECK (uuid_extract_version("day_closeouts"."id") = 7),
	CONSTRAINT "day_closeouts_timezone_not_blank" CHECK (btrim("day_closeouts"."timezone") <> ''),
	CONSTRAINT "day_closeouts_job_status_not_archived" CHECK ("day_closeouts"."job_status" <> 'archived'),
	CONSTRAINT "day_closeouts_note_shape" CHECK ("day_closeouts"."note" IS NULL OR (btrim("day_closeouts"."note") <> '' AND char_length("day_closeouts"."note") <= 2000)),
	CONSTRAINT "day_closeouts_worker_mark_count_nonnegative" CHECK ("day_closeouts"."worker_mark_count" >= 0),
	CONSTRAINT "day_closeouts_material_count_nonnegative" CHECK ("day_closeouts"."material_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "day_closeout_materials" ADD CONSTRAINT "day_closeout_materials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_closeout_materials" ADD CONSTRAINT "day_closeout_materials_company_id_job_id_closeout_id_fk" FOREIGN KEY ("company_id","job_id","closeout_id") REFERENCES "public"."day_closeouts"("company_id","job_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_closeout_materials" ADD CONSTRAINT "day_closeout_materials_company_id_job_id_material_id_fk" FOREIGN KEY ("company_id","job_id","material_id") REFERENCES "public"."materials"("company_id","job_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_closeout_workers" ADD CONSTRAINT "day_closeout_workers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_closeout_workers" ADD CONSTRAINT "day_closeout_workers_company_id_closeout_id_fk" FOREIGN KEY ("company_id","closeout_id") REFERENCES "public"."day_closeouts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_closeout_workers" ADD CONSTRAINT "day_closeout_workers_company_id_worker_id_fk" FOREIGN KEY ("company_id","worker_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_closeouts" ADD CONSTRAINT "day_closeouts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_closeouts" ADD CONSTRAINT "day_closeouts_company_id_job_id_fk" FOREIGN KEY ("company_id","job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_closeouts" ADD CONSTRAINT "day_closeouts_company_id_submitted_by_user_id_fk" FOREIGN KEY ("company_id","submitted_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_closeout_workers_worker_id_idx" ON "day_closeout_workers" USING btree ("worker_id");