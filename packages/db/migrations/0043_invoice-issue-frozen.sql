-- The issue transition, tightened (ARCHITECTURE, 2026-11-11, credit memos: "issuing compares
-- the frozen columns and cannot be combined with a void in one statement"; TASKS R6). 0010's
-- guard froze an issued row and let the issuing statement itself change anything else on it:
-- a tax, a customer or a job rewritten in the UPDATE that issues, or an invoice issued and
-- voided at once. The function is 0010's, replaced whole, with one block added at the head of
-- the issue branch; the comparison is OLD against NEW without the issue's own columns, and
-- `voided_at` and `voided_by_user_id` are among what must not change. Created with
-- `generate --custom`; drizzle-kit never sees functions.
CREATE OR REPLACE FUNCTION check_invoice_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
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
