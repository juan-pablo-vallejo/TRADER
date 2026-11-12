-- Every receipt stored before this migration was pushed by a device: no office writer existed.
-- The default states that for those rows and is dropped at once, so every writer names the
-- value from here on.
ALTER TABLE "materials" ADD COLUMN "entered_by_office" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "entered_by_office" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_office_entry_facts" CHECK (NOT "materials"."entered_by_office" OR (NOT "materials"."captured_offline" AND NOT "materials"."clock_skewed" AND "materials"."clock_skew_ms" = 0));
