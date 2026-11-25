-- Hand-written (drizzle-kit sees no function). A clock-in voided by the office no longer
-- holds its shift: the lock comes off, or passes to another clock-in of the same person on
-- the same job that is not voided (api labor/repair.ts writes it in the void's
-- transaction). Until then a voided clock-in left its shift unmovable and its person read
-- as clocked in. The function is replaced whole; nothing else in it changes, and no entry
-- is written or changed.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_job_assignment_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  ev record;
  clocked_in time;
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
  -- The clock-in that holds the lock has been voided: the lock comes off, or passes to a
  -- clock-in of the same person on the same job that is not voided, the day and times
  -- left as they are. Nothing else frees a locked shift.
  IF OLD.locked_at IS NOT NULL
     AND NEW.locked_by_event_id IS DISTINCT FROM OLD.locked_by_event_id
     AND EXISTS (SELECT 1 FROM work_session_events v
                 WHERE v.type = 'voided' AND v.voids_event_id = OLD.locked_by_event_id) THEN
    IF NEW.work_date <> OLD.work_date OR NEW.expected_start <> OLD.expected_start
       OR NEW.expected_end <> OLD.expected_end THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a shift whose lock passes keeps its day and its times',
        CONSTRAINT = 'job_assignments_locked';
    END IF;
    IF NEW.locked_by_event_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT e.type, e.worker_id, e.job_id INTO ev FROM work_session_events e
      WHERE e.id = NEW.locked_by_event_id;
    IF NOT FOUND OR ev.type <> 'started' OR ev.worker_id <> NEW.user_id
       OR ev.job_id <> NEW.job_id
       OR EXISTS (SELECT 1 FROM work_session_events v
                  WHERE v.type = 'voided' AND v.voids_event_id = NEW.locked_by_event_id) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a lock passes only to a clock-in that stands, of the shift''s own person on its own job',
        CONSTRAINT = 'job_assignments_locked';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.work_date <> OLD.work_date OR NEW.expected_start <> OLD.expected_start
       OR NEW.expected_end > OLD.expected_end
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.locked_by_event_id IS DISTINCT FROM OLD.locked_by_event_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'job_assignments: a shift locked by a clock-in keeps its day, its start and its lock, and its end only moves earlier',
        CONSTRAINT = 'job_assignments_locked';
    END IF;
    IF NEW.expected_end < OLD.expected_end THEN
      -- The clock-in's minute, seconds dropped and never rounded up, as the API places it.
      SELECT date_trunc('minute', e.client_timestamp AT TIME ZONE c.timezone)::time
        INTO clocked_in
        FROM work_session_events e
        JOIN companies c ON c.id = e.company_id
        WHERE e.id = OLD.locked_by_event_id;
      IF NOT FOUND OR NEW.expected_end <= clocked_in THEN
        RAISE EXCEPTION USING
          ERRCODE = 'integrity_constraint_violation',
          MESSAGE = 'job_assignments: a shift locked by a clock-in ends after that clock-in',
          CONSTRAINT = 'job_assignments_locked_end';
      END IF;
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
  RETURN NEW;
END;
$$;
