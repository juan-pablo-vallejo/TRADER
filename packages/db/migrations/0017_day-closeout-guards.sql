-- Guards for the day closeout tables (0016). Created with `generate --custom`; drizzle-kit
-- never sees these objects.
--
-- Append-only: 0002's reject_mutation() on all three, statement-level, TRUNCATE included. A
-- submitted closeout is locked (PRD, Day closeout); a later change is a correcting entry.
CREATE TRIGGER day_closeouts_no_update BEFORE UPDATE ON day_closeouts
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER day_closeouts_no_delete BEFORE DELETE ON day_closeouts
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER day_closeouts_no_truncate BEFORE TRUNCATE ON day_closeouts
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER day_closeout_workers_no_update BEFORE UPDATE ON day_closeout_workers
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER day_closeout_workers_no_delete BEFORE DELETE ON day_closeout_workers
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER day_closeout_workers_no_truncate BEFORE TRUNCATE ON day_closeout_workers
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER day_closeout_materials_no_update BEFORE UPDATE ON day_closeout_materials
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER day_closeout_materials_no_delete BEFORE DELETE ON day_closeout_materials
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER day_closeout_materials_no_truncate BEFORE TRUNCATE ON day_closeout_materials
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
-- The membership seal. Append-only rows can still be inserted, so a closeout records how many
-- members it has, and at every commit the membership must number exactly that: rows are never
-- deleted and the primary keys make each count a set size, so the set is fixed by the commit
-- that creates the closeout. Deferred, because the closeout is inserted before its members;
-- a caller that must see a fault before commit says SET CONSTRAINTS … IMMEDIATE. A member
-- naming a closeout another transaction has not committed fails its foreign key at once. The
-- closeout must also be visible: under REPEATABLE READ a transaction could otherwise count a
-- set that predates the closeout's commit. Visible closeout ⇒ its members are visible (same commit) ⇒
-- an extra row makes the count exceed. Runs under the caller's RLS, which suffices: every
-- member carries its closeout's company_id through the composite foreign key.
CREATE FUNCTION check_day_closeout_seal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  declared record;
BEGIN
  -- Separate branches: plpgsql resolves a field reference only when its branch runs.
  IF TG_TABLE_NAME = 'day_closeouts' THEN
    target := NEW.id;
  ELSE
    target := NEW.closeout_id;
  END IF;
  SELECT c.worker_mark_count, c.material_count INTO declared
  FROM day_closeouts c WHERE c.company_id = NEW.company_id AND c.id = target;
  IF NOT FOUND
    OR declared.worker_mark_count <>
      (SELECT count(*) FROM day_closeout_workers w WHERE w.closeout_id = target)
    OR declared.material_count <>
      (SELECT count(*) FROM day_closeout_materials m WHERE m.closeout_id = target)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'day_closeouts: membership must match the closeout''s declared counts',
      CONSTRAINT = 'day_closeouts_membership_sealed';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER day_closeouts_sealed AFTER INSERT ON day_closeouts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_day_closeout_seal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER day_closeout_workers_sealed AFTER INSERT ON day_closeout_workers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_day_closeout_seal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER day_closeout_materials_sealed AFTER INSERT ON day_closeout_materials
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_day_closeout_seal();
--> statement-breakpoint
-- Row-level security as 0014: ENABLE and FORCE, one policy FOR ALL TO trader_app, USING equal
-- to WITH CHECK, on app_company_id().
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['day_closeouts', 'day_closeout_workers', 'day_closeout_materials']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO trader_app '
      'USING (company_id = public.app_company_id()) '
      'WITH CHECK (company_id = public.app_company_id())',
      t || '_tenant', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Append-only tables get SELECT and INSERT (ARCHITECTURE row 163); withholding UPDATE and
-- DELETE refuses them before the triggers, with 42501.
GRANT SELECT, INSERT ON day_closeouts, day_closeout_workers, day_closeout_materials
  TO trader_app;
