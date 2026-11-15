-- The weekly schedule's guards, tenancy and privileges (ARCHITECTURE, 2026-11-15 rows; TASKS
-- S2), on the tables and columns of 0040. Created with `generate --custom`; drizzle-kit never
-- sees triggers, row-level security, policies or grants.
--
-- 0040 was reordered by hand in one respect: job_assignments' (company_id, id) unique is
-- added before the foreign keys that reference it.
--
-- A shift's person, job and company never change: moving a shift to another job is a removal
-- and a new shift. A shift locked by a clock-in keeps its day and times and is never removed
-- (2026-11-15, a shift is locked by its punch): the lock is set once, by a `started` of that
-- person on that job, and never moved or lifted. A shift an override names keeps its day —
-- the writers drop the override first. Raised as integrity violations with a constraint name,
-- as 0010 does, so a writer can tell them apart.
CREATE FUNCTION check_job_assignment_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ev record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a shift locked by a clock-in is never removed',
        CONSTRAINT = 'job_assignments_locked';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.user_id <> OLD.user_id
     OR NEW.job_id <> OLD.job_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'job_assignments: a shift''s company, person and job never change',
      CONSTRAINT = 'job_assignments_identity';
  END IF;
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.work_date <> OLD.work_date OR NEW.expected_start <> OLD.expected_start
       OR NEW.expected_end <> OLD.expected_end
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.locked_by_event_id IS DISTINCT FROM OLD.locked_by_event_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a shift locked by a clock-in keeps its day, its times and its lock',
        CONSTRAINT = 'job_assignments_locked';
    END IF;
  ELSIF NEW.locked_at IS NOT NULL THEN
    SELECT e.type, e.worker_id, e.job_id INTO ev FROM work_session_events e
      WHERE e.id = NEW.locked_by_event_id;
    IF NOT FOUND OR ev.type <> 'started' OR ev.worker_id <> NEW.user_id
       OR ev.job_id <> NEW.job_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a shift is locked by a clock-in of its own person on its own job',
        CONSTRAINT = 'job_assignments_lock_event';
    END IF;
  END IF;
  IF NEW.work_date <> OLD.work_date AND EXISTS (
    SELECT 1 FROM shift_overrides o WHERE o.holder_id = OLD.id OR o.yielding_id = OLD.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'job_assignments: a shift an override names keeps its day',
      CONSTRAINT = 'job_assignments_override_day';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_assignments_check_mutation
  BEFORE UPDATE OR DELETE ON job_assignments
  FOR EACH ROW EXECUTE FUNCTION check_job_assignment_mutation();
--> statement-breakpoint
-- A shift is inserted unlocked: only a later clock-in locks it, through the guard above.
CREATE FUNCTION check_job_assignment_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.locked_at IS NOT NULL OR NEW.locked_by_event_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'job_assignments: a shift is created unlocked',
      CONSTRAINT = 'job_assignments_created_unlocked';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_assignments_check_insert BEFORE INSERT ON job_assignments
  FOR EACH ROW EXECUTE FUNCTION check_job_assignment_insert();
--> statement-breakpoint
-- TRUNCATE skips row triggers: refused while any shift is locked.
CREATE FUNCTION check_job_assignment_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM job_assignments WHERE locked_at IS NOT NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'job_assignments: a shift locked by a clock-in is never removed',
      CONSTRAINT = 'job_assignments_locked';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_assignments_check_truncate BEFORE TRUNCATE ON job_assignments
  FOR EACH STATEMENT EXECUTE FUNCTION check_job_assignment_truncate();
--> statement-breakpoint
-- An override decides between two shifts of one person on one day. The rows are read FOR KEY
-- SHARE, which the application role may take (it holds UPDATE on job_assignments) and which
-- makes a concurrent removal of either shift wait.
CREATE FUNCTION check_shift_override() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  h record;
  y record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'shift_overrides: an override''s company never changes',
      CONSTRAINT = 'shift_overrides_identity';
  END IF;
  SELECT a.user_id, a.work_date INTO h FROM job_assignments a
    WHERE a.company_id = NEW.company_id AND a.id = NEW.holder_id FOR KEY SHARE;
  SELECT a.user_id, a.work_date INTO y FROM job_assignments a
    WHERE a.company_id = NEW.company_id AND a.id = NEW.yielding_id FOR KEY SHARE;
  -- A shift that is missing, or another company's, is the foreign key's to refuse.
  IF h.user_id IS NOT NULL AND y.user_id IS NOT NULL
     AND (h.user_id <> y.user_id OR h.work_date <> y.work_date) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'shift_overrides: both shifts are one person''s, on one day',
      CONSTRAINT = 'shift_overrides_same_person_day';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shift_overrides_check BEFORE INSERT OR UPDATE ON shift_overrides
  FOR EACH ROW EXECUTE FUNCTION check_shift_override();
--> statement-breakpoint
-- The history is append-only (0002's guard on another table).
CREATE TRIGGER shift_override_history_no_update BEFORE UPDATE ON shift_override_history
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER shift_override_history_no_delete BEFORE DELETE ON shift_override_history
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER shift_override_history_no_truncate BEFORE TRUNCATE ON shift_override_history
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
-- Row-level security as 0014, 0017, 0020, 0029 and 0031.
ALTER TABLE shift_overrides ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shift_overrides FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY shift_overrides_tenant ON shift_overrides FOR ALL TO trader_app
  USING (company_id = public.app_company_id())
  WITH CHECK (company_id = public.app_company_id());
--> statement-breakpoint
ALTER TABLE shift_override_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shift_override_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY shift_override_history_tenant ON shift_override_history FOR ALL TO trader_app
  USING (company_id = public.app_company_id())
  WITH CHECK (company_id = public.app_company_id());
--> statement-breakpoint
-- An override is working state; its history is a fact.
GRANT SELECT, INSERT, UPDATE, DELETE ON shift_overrides TO trader_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON shift_override_history TO trader_app;
--> statement-breakpoint
-- The enforcement switch is the database owner's alone (2026-11-15, schedule enforcement is a
-- switch): the application role keeps UPDATE on the columns it could already write and gets
-- none on schedule_enforced. A privilege narrowed removes no data (invariant 8).
REVOKE UPDATE ON companies FROM trader_app;
--> statement-breakpoint
GRANT UPDATE (name, timezone, updated_at) ON companies TO trader_app;
