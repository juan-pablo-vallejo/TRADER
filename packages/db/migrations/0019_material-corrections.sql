CREATE TYPE "public"."material_correction_kind" AS ENUM('amend', 'void');--> statement-breakpoint
CREATE TABLE "material_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"kind" "material_correction_kind" NOT NULL,
	"description" text,
	"quantity" numeric(12, 3),
	"unit" text,
	"note" text,
	"submitted_by_user_id" uuid NOT NULL,
	"client_timestamp" timestamp with time zone NOT NULL,
	"server_timestamp" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "material_corrections_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "material_corrections_id_v7" CHECK (uuid_extract_version("material_corrections"."id") = 7),
	CONSTRAINT "material_corrections_shape" CHECK (("material_corrections"."kind" = 'amend' AND "material_corrections"."description" IS NOT NULL AND "material_corrections"."quantity" IS NOT NULL
        AND "material_corrections"."unit" IS NOT NULL AND btrim("material_corrections"."description") <> '' AND "material_corrections"."quantity" > 0
        AND btrim("material_corrections"."unit") <> '')
      OR ("material_corrections"."kind" = 'void' AND "material_corrections"."description" IS NULL AND "material_corrections"."quantity" IS NULL
        AND "material_corrections"."unit" IS NULL)),
	CONSTRAINT "material_corrections_note_shape" CHECK ("material_corrections"."note" IS NULL OR (btrim("material_corrections"."note") <> '' AND char_length("material_corrections"."note") <= 2000))
);
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "material_correction_id" uuid;--> statement-breakpoint
ALTER TABLE "material_corrections" ADD CONSTRAINT "material_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_corrections" ADD CONSTRAINT "material_corrections_company_id_material_id_fk" FOREIGN KEY ("company_id","material_id") REFERENCES "public"."day_closeout_materials"("company_id","material_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_corrections" ADD CONSTRAINT "material_corrections_company_id_submitted_by_user_id_fk" FOREIGN KEY ("company_id","submitted_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_corrections_material_id_server_timestamp_idx" ON "material_corrections" USING btree ("material_id","server_timestamp");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_company_id_material_correction_id_fk" FOREIGN KEY ("company_id","material_correction_id") REFERENCES "public"."material_corrections"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_company_id_material_correction_id_unique" UNIQUE("company_id","material_correction_id");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_one_subject" CHECK (num_nonnulls("approvals"."event_id", "approvals"."material_correction_id") = 1);--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_material_corrected" CHECK ("approvals"."material_correction_id" IS NULL OR (coalesce('corrected'::approval_reason = ANY ("approvals"."reasons"), false) AND array_position("approvals"."reasons", NULL) IS NULL));