CREATE TABLE "pay_period_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"hundredths" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_period_lines_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "pay_period_lines_period_id_worker_id_job_id_work_date_unique" UNIQUE("period_id","worker_id","job_id","work_date"),
	CONSTRAINT "pay_period_lines_hundredths_nonzero" CHECK ("pay_period_lines"."hundredths" <> 0)
);
--> statement-breakpoint
ALTER TABLE "pay_periods" ADD COLUMN "unresolved_pending_sessions" integer;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD COLUMN "unresolved_open_sessions" integer;--> statement-breakpoint
ALTER TABLE "pay_period_lines" ADD CONSTRAINT "pay_period_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period_lines" ADD CONSTRAINT "pay_period_lines_company_id_period_id_fk" FOREIGN KEY ("company_id","period_id") REFERENCES "public"."pay_periods"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period_lines" ADD CONSTRAINT "pay_period_lines_company_id_worker_id_fk" FOREIGN KEY ("company_id","worker_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period_lines" ADD CONSTRAINT "pay_period_lines_company_id_job_id_fk" FOREIGN KEY ("company_id","job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_unresolved_only_when_closed" CHECK ("pay_periods"."closed_at" IS NOT NULL OR ("pay_periods"."unresolved_pending_sessions" IS NULL AND "pay_periods"."unresolved_open_sessions" IS NULL));--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_unresolved_nonnegative" CHECK ("pay_periods"."unresolved_pending_sessions" >= 0 AND "pay_periods"."unresolved_open_sessions" >= 0);