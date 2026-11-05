ALTER TABLE "material_corrections" DROP CONSTRAINT "material_corrections_company_id_material_id_fk";
--> statement-breakpoint
ALTER TABLE "material_corrections" ADD CONSTRAINT "material_corrections_company_id_material_id_materials_fk" FOREIGN KEY ("company_id","material_id") REFERENCES "public"."materials"("company_id","id") ON DELETE no action ON UPDATE no action;