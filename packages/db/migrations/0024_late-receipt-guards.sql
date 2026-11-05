-- Corrections of a receipt that arrived after its day's closeout (ARCHITECTURE, original
-- receipts as approval subjects). Created with `generate --custom`; drizzle-kit never sees these
-- objects. Both rules name `after_closeout`, an ADD VALUE label (0021), so they live in plpgsql.
--
-- A late receipt is one whose approval, written by the push that recorded it, carries
-- `after_closeout`. Approvals fix their subject and reasons (0020), so once late, always late.
--
-- Which receipts take a correction: a committed closeout's member (0019's rule, which its foreign
-- key stated until 0023 re-pointed it at materials) or a late receipt. Never written into a
-- closeout's membership, which stays sealed. Looked up under the caller's RLS; the composite
-- foreign key keeps the correction in the receipt's company, so a missing row is "not eligible".
CREATE FUNCTION check_material_correction_eligible() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM day_closeout_materials m
    WHERE m.company_id = NEW.company_id AND m.material_id = NEW.material_id
  ) AND NOT EXISTS (
    SELECT 1 FROM approvals a
    WHERE a.company_id = NEW.company_id AND a.material_id = NEW.material_id
      AND 'after_closeout'::approval_reason = ANY (a.reasons)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'material_corrections: only a closed-out or after-closeout receipt is corrected',
      CONSTRAINT = 'material_corrections_eligible';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER material_corrections_eligible BEFORE INSERT ON material_corrections
  FOR EACH ROW EXECUTE FUNCTION check_material_correction_eligible();
--> statement-breakpoint
-- A late receipt is frozen as 0018 freezes a member: its facts never change, only the office's
-- cost fill; a change is a correcting entry. Whole-row comparison, so a column added later is
-- frozen without editing this function. A sibling of reject_closed_out_material_change, which
-- stays as it is.
CREATE FUNCTION reject_late_receipt_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM approvals a
    WHERE a.company_id = OLD.company_id AND a.material_id = OLD.id
      AND 'after_closeout'::approval_reason = ANY (a.reasons)
  ) AND (
    TG_OP = 'DELETE'
    OR (to_jsonb(NEW) - 'cost_cents' - 'currency' - 'updated_at')
      IS DISTINCT FROM (to_jsonb(OLD) - 'cost_cents' - 'currency' - 'updated_at')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = format('materials: an after-closeout receipt is frozen: %s rejected', TG_OP),
      CONSTRAINT = 'materials_late_receipt_frozen',
      HINT = 'Record a correcting entry instead.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER materials_late_receipt_frozen BEFORE UPDATE OR DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION reject_late_receipt_change();
