-- An email a person adds to their own login, proved by a code sent to it (me.addEmail):
-- the pending claim on the person's row, and the address log taking that one self-change.
SET lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_claim" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_claim_code_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_claim_sent_at" timestamp with time zone;--> statement-breakpoint
-- squawk-ignore prefer-bigint-over-int
ALTER TABLE "users" ADD COLUMN "email_claim_tries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- The check is widened, not removed: an email added to a login with none may be the
-- person's own change. Every row the old check allowed, the new one allows, so the rows
-- already there need no scan: NOT VALID holds every row written from now on.
-- squawk-ignore ban-drop-constraint
ALTER TABLE "address_changes" DROP CONSTRAINT "address_changes_not_own";--> statement-breakpoint
ALTER TABLE "address_changes" ADD CONSTRAINT "address_changes_not_own" CHECK ("address_changes"."user_id" <> "address_changes"."changed_by_user_id" OR ("address_changes"."field" = 'email' AND "address_changes"."old_value" IS NULL)) NOT VALID;
