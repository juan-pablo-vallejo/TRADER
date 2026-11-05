ALTER TYPE "public"."approval_reason" ADD VALUE 'after_closeout';--> statement-breakpoint
ALTER TABLE "approvals" DROP CONSTRAINT "approvals_one_subject";--> statement-breakpoint
ALTER TABLE "work_session_events" ADD COLUMN "captured_offline" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "material_id" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "captured_offline" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "clock_skewed" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "clock_skew_ms" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_company_id_material_id_fk" FOREIGN KEY ("company_id","material_id") REFERENCES "public"."materials"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_company_id_material_id_unique" UNIQUE("company_id","material_id");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_reasons_no_null" CHECK (array_position("approvals"."reasons", NULL) IS NULL);--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_one_subject" CHECK (num_nonnulls("approvals"."event_id", "approvals"."material_correction_id", "approvals"."material_id") = 1);