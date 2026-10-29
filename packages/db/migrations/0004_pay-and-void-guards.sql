-- Guards drizzle-kit cannot express (see 0002): an extension, an exclusion constraint and
-- three trigger functions. Every pending migration runs in one transaction, and a fresh
-- database replays the whole journal in one, so a label added by ALTER TYPE … ADD VALUE
-- ('voided', 0003) is unusable in any CHECK, DEFAULT or index predicate anywhere in the
-- journal (SQLSTATE 55P04). The rules that name it live in plpgsql, which resolves the
-- literal at first execution, after the commit.
CREATE EXTENSION btree_gist;
--> statement-breakpoint
-- Pay periods of one company never overlap (ARCHITECTURE decisions: immutable closed
-- periods). btree_gist lets uuid equality share the GiST index with the date range; bounds
-- are inclusive work dates, hence '[]'.
ALTER TABLE pay_periods ADD CONSTRAINT pay_periods_no_overlap
  EXCLUDE USING gist (company_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);
--> statement-breakpoint
-- A void names the session it voids and nothing else does; a void corrects nothing.
-- check_violation with a constraint name, so the API maps it like any CHECK.
CREATE FUNCTION check_work_session_event_references() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.type = 'voided') <> (NEW.voids_event_id IS NOT NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'work_session_events: voids_event_id is set exactly when type is voided',
      CONSTRAINT = 'work_session_events_void_reference';
  END IF;
  IF NEW.type = 'voided' AND NEW.corrects_event_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'work_session_events: a voided event corrects nothing',
      CONSTRAINT = 'work_session_events_void_corrects_nothing';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_session_events_check_references BEFORE INSERT ON work_session_events
  FOR EACH ROW EXECUTE FUNCTION check_work_session_event_references();
--> statement-breakpoint
-- A row is frozen once the column named in the trigger argument is set: a closed pay period
-- and a decided approval are never rewritten (PRD Goal 4). A later change is a new event.
CREATE FUNCTION reject_frozen_row_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(OLD) ->> TG_ARGV[0] IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = format('%s row is frozen once %s is set: %s rejected',
                       TG_TABLE_NAME, TG_ARGV[0], TG_OP),
      HINT = 'Record a correcting event instead.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pay_periods_frozen_when_closed BEFORE UPDATE OR DELETE ON pay_periods
  FOR EACH ROW EXECUTE FUNCTION reject_frozen_row_mutation('closed_at');
--> statement-breakpoint
CREATE TRIGGER approvals_frozen_when_decided BEFORE UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION reject_frozen_row_mutation('decision');
--> statement-breakpoint
-- Periods close in order, as they stand. Membership of a late event is derived from the
-- earliest period not yet closed at its receipt (Stage 3), which is only stable if no
-- earlier period is still open when a later one closes.
CREATE FUNCTION check_pay_period_close() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
    IF (NEW.starts_on, NEW.ends_on) IS DISTINCT FROM (OLD.starts_on, OLD.ends_on) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'pay_periods: close the period as it stands; move its bounds first',
        CONSTRAINT = 'pay_periods_close_as_is';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pay_periods p
      WHERE p.company_id = NEW.company_id AND p.id <> NEW.id
        AND p.closed_at IS NULL AND p.starts_on < NEW.starts_on
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'pay_periods close in order: an earlier period is still open',
        CONSTRAINT = 'pay_periods_close_in_order';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pay_periods_check_close BEFORE UPDATE ON pay_periods
  FOR EACH ROW EXECUTE FUNCTION check_pay_period_close();
