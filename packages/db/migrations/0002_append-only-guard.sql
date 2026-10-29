-- Append-only guard for work_session_events (ARCHITECTURE invariant 1). A trigger, not
-- REVOKE: the application connects as the table owner, and an owner can always re-grant
-- itself. Statement-level, so a bulk UPDATE is refused before any row is touched, and
-- TRUNCATE (which bypasses row triggers) gets its own guard. drizzle-kit never sees this
-- file's objects: it was created with `generate --custom`, and no later generate drops them.
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'integrity_constraint_violation',
    MESSAGE = format('%s is append-only: %s rejected', TG_TABLE_NAME, TG_OP),
    HINT = 'Record a correcting event instead.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_session_events_no_update BEFORE UPDATE ON work_session_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER work_session_events_no_delete BEFORE DELETE ON work_session_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER work_session_events_no_truncate BEFORE TRUNCATE ON work_session_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
