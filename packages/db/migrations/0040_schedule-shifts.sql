CREATE TABLE "shift_override_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"override_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"holder_shift_id" uuid NOT NULL,
	"holder_job_id" uuid NOT NULL,
	"holder_start" time NOT NULL,
	"holder_end" time NOT NULL,
	"yielding_shift_id" uuid NOT NULL,
	"yielding_job_id" uuid NOT NULL,
	"yielding_start" time NOT NULL,
	"yielding_end" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_override_history_action" CHECK ("shift_override_history"."action" IN ('created', 'changed', 'removed')),
	CONSTRAINT "shift_override_history_reason_not_blank" CHECK (btrim("shift_override_history"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "shift_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"holder_id" uuid NOT NULL,
	"yielding_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_overrides_two_shifts" CHECK ("shift_overrides"."holder_id" <> "shift_overrides"."yielding_id"),
	CONSTRAINT "shift_overrides_reason_not_blank" CHECK (btrim("shift_overrides"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "job_assignments" DROP CONSTRAINT "job_assignments_user_id_work_date_job_id_unique";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "schedule_enforced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD COLUMN "copy_id" uuid;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD COLUMN "locked_by_event_id" uuid;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "shift_override_history" ADD CONSTRAINT "shift_override_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_override_history" ADD CONSTRAINT "shift_override_history_company_id_actor_user_id_fk" FOREIGN KEY ("company_id","actor_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_override_history" ADD CONSTRAINT "shift_override_history_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_override_history" ADD CONSTRAINT "shift_override_history_company_id_holder_job_id_fk" FOREIGN KEY ("company_id","holder_job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_override_history" ADD CONSTRAINT "shift_override_history_company_id_yielding_job_id_fk" FOREIGN KEY ("company_id","yielding_job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_overrides" ADD CONSTRAINT "shift_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_overrides" ADD CONSTRAINT "shift_overrides_company_id_holder_id_fk" FOREIGN KEY ("company_id","holder_id") REFERENCES "public"."job_assignments"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_overrides" ADD CONSTRAINT "shift_overrides_company_id_yielding_id_fk" FOREIGN KEY ("company_id","yielding_id") REFERENCES "public"."job_assignments"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_overrides" ADD CONSTRAINT "shift_overrides_company_id_created_by_fk" FOREIGN KEY ("company_id","created_by") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_override_history_company_id_user_id_work_date_idx" ON "shift_override_history" USING btree ("company_id","user_id","work_date");--> statement-breakpoint
CREATE INDEX "shift_override_history_company_id_override_id_idx" ON "shift_override_history" USING btree ("company_id","override_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_overrides_pair_unique" ON "shift_overrides" USING btree (least("holder_id", "yielding_id"),greatest("holder_id", "yielding_id"));--> statement-breakpoint
CREATE INDEX "shift_overrides_company_id_yielding_id_idx" ON "shift_overrides" USING btree ("company_id","yielding_id");--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_company_id_locked_by_event_id_fk" FOREIGN KEY ("company_id","locked_by_event_id") REFERENCES "public"."work_session_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_assignments_company_id_copy_id_idx" ON "job_assignments" USING btree ("company_id","copy_id");--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_exact_shift_unique" UNIQUE("user_id","work_date","job_id","expected_start","expected_end");--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_lock_complete" CHECK (("job_assignments"."locked_at" IS NULL) = ("job_assignments"."locked_by_event_id" IS NULL));