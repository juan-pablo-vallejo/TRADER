-- Append-only enforcement for work_session_events.
--
-- HAND-WRITTEN. drizzle-kit does not generate triggers, so this file is
-- maintained by hand and must not be regenerated. It is applied by the normal
-- migrate runner alongside the generated migrations.
--
-- Why a trigger rather than permissions: SPEC §5 states that no role, INCLUDING
-- ADMIN, may mutate a submitted labor record. The application connects as the
-- role that owns these tables, so REVOKE UPDATE/DELETE does not bind it — an
-- owner can always re-grant itself. A trigger fires regardless of who is asking,
-- which is the only way to make the invariant hold against our own code.
--
-- This is the invariant payroll trust rests on. Corrections are new `voided` or
-- correcting events referencing the original through `payload`; SPEC §4 is
-- explicit that there is no corrections table and no in-place edit.

CREATE OR REPLACE FUNCTION trader_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'append-only violation: % on %.% is forbidden',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING
      ERRCODE = 'restrict_violation',
      HINT = 'Labor history is immutable. Record a correcting or voided event instead.';
END;
$$;

-- Statement-level: fires once per statement and rejects it before any row is
-- touched, so a bulk UPDATE cannot partially apply.
DROP TRIGGER IF EXISTS work_session_events_no_update ON work_session_events;
CREATE TRIGGER work_session_events_no_update
  BEFORE UPDATE ON work_session_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION trader_reject_mutation();

DROP TRIGGER IF EXISTS work_session_events_no_delete ON work_session_events;
CREATE TRIGGER work_session_events_no_delete
  BEFORE DELETE ON work_session_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION trader_reject_mutation();

-- TRUNCATE bypasses row- and statement-level UPDATE/DELETE triggers entirely,
-- so it needs its own guard. Without this, one TRUNCATE erases all labor history.
DROP TRIGGER IF EXISTS work_session_events_no_truncate ON work_session_events;
CREATE TRIGGER work_session_events_no_truncate
  BEFORE TRUNCATE ON work_session_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION trader_reject_mutation();
