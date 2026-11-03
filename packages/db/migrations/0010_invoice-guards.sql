-- Guards drizzle-kit cannot express (see 0002, 0004): the invoice lifecycle, gap-free
-- numbering and the credit-memo rules (PRD, Invoicing and exports). Nothing here names an
-- enum member; the rules are plpgsql all the same, so a later member costs nothing (MEMORY
-- Notes on 55P04). Every counter UPDATE sets updated_at itself: the ORM's $onUpdate never
-- sees a trigger's statement.

-- Every invoice is born a draft. Issue assigns the next number from the company's counter:
-- the UPDATE takes the counter row's lock, so concurrent issues serialise, and it rolls back
-- with the issuing transaction, so an aborted issue leaves no gap — which a sequence, never
-- rolled back, cannot promise. Once issued the row is frozen; the one later change is to
-- void it, once, touching nothing else.
CREATE FUNCTION check_invoice_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
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
--> statement-breakpoint
CREATE TRIGGER invoices_check_mutation BEFORE INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION check_invoice_mutation();
--> statement-breakpoint
-- Lines are the snapshot an issued invoice is made of. The parent row is locked FOR SHARE
-- so a concurrent issue (FOR UPDATE on the invoice) waits for this transaction and then
-- sees its lines; a cascaded DELETE finds no parent, which is permitted.
CREATE FUNCTION check_invoice_line_item_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_issued_at timestamptz;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT i.issued_at INTO parent_issued_at FROM invoices i
      WHERE i.id = OLD.invoice_id FOR SHARE;
    IF parent_issued_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = format('invoice_line_items: the invoice is issued; %s rejected', TG_OP),
        CONSTRAINT = 'invoice_line_items_invoice_frozen';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT i.issued_at INTO parent_issued_at FROM invoices i
      WHERE i.id = NEW.invoice_id FOR SHARE;
    IF parent_issued_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = format('invoice_line_items: the invoice is issued; %s rejected', TG_OP),
        CONSTRAINT = 'invoice_line_items_invoice_frozen';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_line_items_check_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION check_invoice_line_item_mutation();
--> statement-breakpoint
-- Memo against an issued, unvoided invoice; FOR SHARE makes a concurrent void
-- (FOR NO KEY UPDATE) wait, then this re-reads and rejects. Numbered from the company's own
-- credit-memo series under the same counter row lock, then append-only (0002's guard).
CREATE FUNCTION check_credit_memo_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv_issued_at timestamptz;
  inv_voided_at timestamptz;
BEGIN
  IF NEW.number IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'credit_memos: the number is assigned at insert, never supplied',
      CONSTRAINT = 'credit_memos_number_assigned';
  END IF;
  SELECT i.issued_at, i.voided_at INTO inv_issued_at, inv_voided_at FROM invoices i
    WHERE i.id = NEW.invoice_id FOR SHARE;
  IF inv_issued_at IS NULL OR inv_voided_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'credit_memos: a credit memo is against an issued, unvoided invoice',
      CONSTRAINT = 'credit_memos_invoice_issued';
  END IF;
  UPDATE invoice_counters
    SET next_credit_memo_number = next_credit_memo_number + 1, updated_at = now()
    WHERE company_id = NEW.company_id
    RETURNING next_credit_memo_number - 1 INTO NEW.number;
  IF NEW.number IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'credit_memos: the company has no number series; create its invoice_counters row',
      CONSTRAINT = 'credit_memos_counter_missing';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER credit_memos_check_insert BEFORE INSERT ON credit_memos
  FOR EACH ROW EXECUTE FUNCTION check_credit_memo_insert();
--> statement-breakpoint
CREATE TRIGGER credit_memos_no_update BEFORE UPDATE ON credit_memos
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER credit_memos_no_delete BEFORE DELETE ON credit_memos
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER credit_memos_no_truncate BEFORE TRUNCATE ON credit_memos
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
