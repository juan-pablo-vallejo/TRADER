-- Hand-written (drizzle-kit sees no function). A shift a clock-in has locked could not
-- change at all, so under schedule enforcement nobody could be moved to another job
-- mid-day: the day's second shift would overlap the first. From here a locked shift's end
-- may move earlier, to any minute after the clock-in that locked it, read on the company's
-- wall clock as every shift time is. Nothing else about a locked shift may change, and it
-- is still never removed. No clock event is read for anything but that one minute, and none
-- is written.
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
