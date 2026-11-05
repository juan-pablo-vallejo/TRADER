-- Guards for material corrections and their approvals (0019). Created with
-- `generate --custom`; drizzle-kit never sees these objects.
--
-- Append-only: 0002's reject_mutation(), statement-level, TRUNCATE included. A wrong
-- correction is answered by the approver's rejection or by a later correction, never an edit.
CREATE TRIGGER material_corrections_no_update BEFORE UPDATE ON material_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER material_corrections_no_delete BEFORE DELETE ON material_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER material_corrections_no_truncate BEFORE TRUNCATE ON material_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
-- Every correction goes through approval (PRD, Day closeout): at commit its approvals row
-- exists. Deferred, because the correction is inserted before the row naming it; a caller
-- that must see the fault before commit says SET CONSTRAINTS … IMMEDIATE. Runs under the
-- caller's RLS, which suffices: the approval carries the correction's company_id through the
-- composite foreign key. A correction with no row could only count as pending anyway.
CREATE FUNCTION check_material_correction_approved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM approvals a
    WHERE a.company_id = NEW.company_id AND a.material_correction_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'material_corrections: a correction needs its approvals row',
      CONSTRAINT = 'material_corrections_approved';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER material_corrections_approved AFTER INSERT ON material_corrections
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_material_correction_approved();
--> statement-breakpoint
-- An approval's subject and reasons are fixed: only the decision is set (once, 0004's
-- freeze), so a pending row can never be re-pointed at another entry or stripped of a reason.
-- Whole-row comparison, as 0015's guard, so a column added later is fixed without editing
-- this function. Every row, the event ones included.
CREATE FUNCTION check_approval_subject_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'decision' - 'decided_at' - 'decided_by_user_id' - 'updated_at')
    IS DISTINCT FROM
    (to_jsonb(OLD) - 'decision' - 'decided_at' - 'decided_by_user_id' - 'updated_at')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: only the decision of an approval changes',
      CONSTRAINT = 'approvals_subject_fixed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER approvals_subject_fixed BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION check_approval_subject_fixed();
--> statement-breakpoint
-- A material correction's approval (PRD, Office approval: nobody approves their own entries):
-- written pending, and never decided by the correction's submitter. The correction is looked
-- up under the caller's RLS; not finding it refuses, so the rule fails closed without a tenant.
-- Event approvals keep the API rule until the approval queue (Stage 3).
CREATE FUNCTION check_material_approval_decider() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  submitter uuid;
BEGIN
  IF NEW.material_correction_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.decision IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: a material correction''s approval is written pending',
      CONSTRAINT = 'approvals_material_born_pending';
  END IF;
  SELECT c.submitted_by_user_id INTO submitter
  FROM material_corrections c
  WHERE c.company_id = NEW.company_id AND c.id = NEW.material_correction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: the material correction is not visible',
      CONSTRAINT = 'approvals_material_correction_visible';
  END IF;
  IF NEW.decided_by_user_id IS NOT NULL AND NEW.decided_by_user_id = submitter THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: nobody decides their own correction',
      CONSTRAINT = 'approvals_not_self_decided';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER approvals_material_decider BEFORE INSERT OR UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION check_material_approval_decider();
--> statement-breakpoint
-- Row-level security as 0014 and 0017.
ALTER TABLE material_corrections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE material_corrections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY material_corrections_tenant ON material_corrections FOR ALL TO trader_app
  USING (company_id = public.app_company_id())
  WITH CHECK (company_id = public.app_company_id());
--> statement-breakpoint
-- Append-only: SELECT and INSERT (ARCHITECTURE row 163).
GRANT SELECT, INSERT ON material_corrections TO trader_app;
