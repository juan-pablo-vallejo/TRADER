ALTER TABLE "users" ADD COLUMN "sign_in_phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_sign_in_phone_unique" UNIQUE("company_id","sign_in_phone");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sign_in_phone_e164" CHECK ("users"."sign_in_phone" ~ '^\+1[2-9][0-9]{9}$');