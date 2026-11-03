CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"material_id" uuid,
	"taken_by_user_id" uuid NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "photos_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "photos_id_v7" CHECK (uuid_extract_version("photos"."id") = 7),
	CONSTRAINT "photos_object_key_not_blank" CHECK (btrim("photos"."object_key") <> ''),
	CONSTRAINT "photos_content_type_image" CHECK ("photos"."content_type" ~ '^image/[a-z0-9.+-]+$'),
	CONSTRAINT "photos_byte_size_positive" CHECK ("photos"."byte_size" > 0),
	CONSTRAINT "photos_sha256_hex" CHECK ("photos"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_company_id_job_id_fk" FOREIGN KEY ("company_id","job_id") REFERENCES "public"."jobs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_company_id_job_id_material_id_fk" FOREIGN KEY ("company_id","job_id","material_id") REFERENCES "public"."materials"("company_id","job_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_company_id_taken_by_user_id_fk" FOREIGN KEY ("company_id","taken_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_job_id_taken_at_idx" ON "photos" USING btree ("job_id","taken_at");--> statement-breakpoint
CREATE INDEX "photos_material_id_idx" ON "photos" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "photos_taken_by_user_id_idx" ON "photos" USING btree ("taken_by_user_id");