CREATE TABLE "job_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"expected_start" time NOT NULL,
	"expected_end" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_assignments_user_id_work_date_job_id_unique" UNIQUE("user_id","work_date","job_id"),
	CONSTRAINT "job_assignments_end_after_start" CHECK ("job_assignments"."expected_end" > "job_assignments"."expected_start")
);
--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_job_id_fk" FOREIGN KEY ("company_id","job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_assignments_company_id_work_date_idx" ON "job_assignments" USING btree ("company_id","work_date");