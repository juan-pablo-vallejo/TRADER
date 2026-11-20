ALTER TABLE "invoices" ADD COLUMN "due_on" date;--> statement-breakpoint
-- Hand-written from here to the constraint (drizzle-kit sees no trigger and no backfill).
-- Every invoice already issued gets the day it was due: the day of issue on its company's
-- wall clock plus that company's terms as they stand, which is what issuing fills from
-- here on. An issued invoice is frozen by its trigger, so the trigger stands aside for
-- this one statement and nothing else of any row is touched. Written before production
-- exists: staging and development hold the only issued invoices there are.
ALTER TABLE "invoices" DISABLE TRIGGER invoices_check_mutation;--> statement-breakpoint
UPDATE "invoices" i
  SET "due_on" = (i."issued_at" AT TIME ZONE c."timezone")::date + c."invoice_terms_days"
  FROM "companies" c
  WHERE c."id" = i."company_id" AND i."issued_at" IS NOT NULL AND i."due_on" IS NULL;--> statement-breakpoint
ALTER TABLE "invoices" ENABLE TRIGGER invoices_check_mutation;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_has_due" CHECK ("invoices"."issued_at" IS NULL OR "invoices"."due_on" IS NOT NULL);--> statement-breakpoint
-- The invoice's trigger, as the baseline wrote it, with one addition at the issue
-- transition: an invoice issued with no due date takes one from its company's terms. A
-- draft may name its own, and issuing then leaves it as named. The check that issuing
-- changes nothing but the issue itself still reads what the statement supplied, and an
-- issued row's due date is frozen with every other column.
CREATE OR REPLACE FUNCTION check_invoice_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  frozen_old jsonb;
  frozen_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.issued_at IS NOT NULL OR NEW.number IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: every invoice is born a draft and issued by UPDATE',
        CONSTRAINT = 'invoices_born_draft';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.issued_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: an issued invoice is never deleted; void it',
        CONSTRAINT = 'invoices_issued_never_deleted';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: the issue transition.
  IF OLD.issued_at IS NULL AND NEW.issued_at IS NOT NULL THEN
    -- Issuing changes nothing else: the customer, job, currency and tax that are issued are
    -- the ones the draft held, and an issue is never a void in the same statement.
    frozen_old := to_jsonb(OLD) - 'issued_at' - 'issued_by_user_id' - 'number' - 'updated_at';
    frozen_new := to_jsonb(NEW) - 'issued_at' - 'issued_by_user_id' - 'number' - 'updated_at';
    IF frozen_old <> frozen_new THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: issuing changes nothing but the issue itself, and is never a void',
        CONSTRAINT = 'invoices_issue_alone';
    END IF;
    IF NEW.number IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: the number is assigned at issue, never supplied',
        CONSTRAINT = 'invoices_number_assigned';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM invoice_line_items l
                   WHERE l.company_id = NEW.company_id AND l.invoice_id = NEW.id) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: an invoice issues with at least one line',
        CONSTRAINT = 'invoices_issued_has_lines';
    END IF;
    UPDATE invoice_counters
      SET next_invoice_number = next_invoice_number + 1, updated_at = now()
      WHERE company_id = NEW.company_id
      RETURNING next_invoice_number - 1 INTO NEW.number;
    IF NEW.number IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: the company has no number series; create its invoice_counters row',
        CONSTRAINT = 'invoices_counter_missing';
    END IF;
    -- The day it is due, when the draft named none: the day of issue on the company's
    -- wall clock, plus the company's terms. From here it is frozen with the rest.
    IF NEW.due_on IS NULL THEN
      SELECT (NEW.issued_at AT TIME ZONE c.timezone)::date + c.invoice_terms_days
        INTO NEW.due_on
        FROM companies c WHERE c.id = NEW.company_id;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE of an issued row: only the void transition, once.
  IF OLD.issued_at IS NOT NULL THEN
    frozen_old := to_jsonb(OLD) - 'voided_at' - 'voided_by_user_id' - 'updated_at';
    frozen_new := to_jsonb(NEW) - 'voided_at' - 'voided_by_user_id' - 'updated_at';
    IF frozen_old <> frozen_new OR OLD.voided_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'invoices: an issued invoice is immutable; the only change is to void it once',
        CONSTRAINT = 'invoices_issued_frozen';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
