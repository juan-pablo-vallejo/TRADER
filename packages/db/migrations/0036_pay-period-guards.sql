-- Pay periods, the rules 0004 left for the task that builds them (ARCHITECTURE, Accounting and
-- exports: Pay-period close, Late adjustments; the 2026-11-11 membership row; V1-D03). Created
-- with `generate --custom`; drizzle-kit never sees functions or triggers.
-- One opener or closer per company at a time. A close subtracts what every earlier close
-- stored, and a period is placed against the closed ones: both read rows another transaction
-- may be writing, so each takes this lock first and reads after it. A key space of its own —
-- the prefix keeps it from ever equalling the field-write lock's or a worker's key. Held to
-- the end of the transaction; taking it again in the same transaction is free, so the API
-- takes it before its reads and the triggers below take it again.
CREATE FUNCTION lock_pay_periods(company uuid) RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('pay-periods:' || company::text, 0))
$$;
--> statement-breakpoint
-- A period is inserted open, and neither an insert nor a move of an open period's bounds puts
-- it earlier than a closed one: the hours of its dates would belong to a period that closes
-- after a later one already exported (2026-11-11 membership row). Overlap is 0004's exclusion
-- constraint. Runs under the caller's RLS, which shows it every period of its own company.
CREATE FUNCTION check_pay_period_placement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'pay_periods: a period is inserted open and closed by an update',
        CONSTRAINT = 'pay_periods_inserted_open';
    END IF;
  ELSIF (NEW.starts_on, NEW.ends_on) IS NOT DISTINCT FROM (OLD.starts_on, OLD.ends_on) THEN
    RETURN NEW;
  END IF;
  PERFORM lock_pay_periods(NEW.company_id);
  IF EXISTS (
    SELECT 1 FROM pay_periods p
    WHERE p.company_id = NEW.company_id AND p.id <> NEW.id
      AND p.closed_at IS NOT NULL AND p.starts_on > NEW.starts_on
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'pay_periods: a period never lies earlier than a closed one',
      CONSTRAINT = 'pay_periods_after_closed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pay_periods_placed BEFORE INSERT OR UPDATE ON pay_periods
  FOR EACH ROW EXECUTE FUNCTION check_pay_period_placement();
--> statement-breakpoint
-- 0004's close check, replaced in place: as it was, and now behind the lock, so "no earlier
-- period is open" is read after any concurrent opener or closer has finished; and the closing
-- update states what was unresolved (V1-D03: the acknowledgment the server judged is kept on
-- the row it closed).
CREATE OR REPLACE FUNCTION check_pay_period_close() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
    PERFORM lock_pay_periods(NEW.company_id);
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
    IF NEW.unresolved_pending_sessions IS NULL OR NEW.unresolved_open_sessions IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'pay_periods: a close states how many sessions it left unresolved',
        CONSTRAINT = 'pay_periods_close_counted';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- A line is written into a period that is still open, by the transaction that then closes it.
-- The row lock is the point: a second writer waits here until the first has committed, then
-- reads the period closed and is refused, so no line ever joins a period after its close.
-- Which side of starts_on the date falls on is what makes a line the period's own hours or an
-- adjustment (schema/pay.ts); own hours are never negative, and no line reaches past the
-- period's last day. An invisible period (another tenant's) is refused as a missing one.
CREATE FUNCTION check_pay_period_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  period record;
BEGIN
  SELECT p.starts_on, p.ends_on, p.closed_at INTO period
  FROM pay_periods p
  WHERE p.company_id = NEW.company_id AND p.id = NEW.period_id
  FOR NO KEY UPDATE;
  IF NOT FOUND OR period.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'pay_period_lines: a line is written only while its period is open',
      CONSTRAINT = 'pay_period_lines_period_open';
  END IF;
  IF NEW.work_date > period.ends_on THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'pay_period_lines: a work date never lies after its period',
      CONSTRAINT = 'pay_period_lines_date_in_reach';
  END IF;
  IF NEW.work_date >= period.starts_on AND NEW.hundredths < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'pay_period_lines: a period''s own hours are positive; only an adjustment is signed',
      CONSTRAINT = 'pay_period_lines_own_hours_positive';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pay_period_lines_checked BEFORE INSERT ON pay_period_lines
  FOR EACH ROW EXECUTE FUNCTION check_pay_period_line();
--> statement-breakpoint
-- The other half of the seal: at commit, a line's period is closed. With the check above, a
-- line exists only for a closed period and only from the transaction that closed it. Deferred,
-- because the lines are inserted before the closing update; a caller that must see a fault
-- before commit says SET CONSTRAINTS … IMMEDIATE (0017). No WHEN: every line is checked.
CREATE FUNCTION check_pay_period_line_sealed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pay_periods p
    WHERE p.company_id = NEW.company_id AND p.id = NEW.period_id
      AND p.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'pay_period_lines: lines are committed only with their period''s close',
      CONSTRAINT = 'pay_period_lines_sealed_at_close';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pay_period_lines_sealed AFTER INSERT ON pay_period_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_pay_period_line_sealed();
