-- An office repair's approval (PRD, Office approval: an entry that was edited or corrected needs
-- approval before it counts). A labor event that corrects another or voids a session has, at
-- commit, an approval holding `corrected`: an event with no approvals row is approved by
-- default, so a repair written without one would count toward payroll unreviewed. The labor
-- sibling of 0020's material_corrections_approved; 0022's check covers only the reasons an
-- event's own flag columns imply, and stays as it is. Created with `generate --custom`;
-- drizzle-kit never sees these objects. Runs under the caller's RLS, which suffices: the
-- approval carries the event's company_id through its composite foreign key. `corrected` was
-- created with the type (0003); naming it in plpgsql is safe either way (see enums.ts).
CREATE FUNCTION check_event_repair_approved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM approvals a
    WHERE a.company_id = NEW.company_id
      AND a.event_id = NEW.id
      AND 'corrected'::approval_reason = ANY (a.reasons)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'work_session_events: a correction or void needs an approval holding corrected',
      CONSTRAINT = 'work_session_events_repair_approved';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Deferred, because the event is inserted before the approval naming it; a caller that must see
-- the fault first says SET CONSTRAINTS … IMMEDIATE. WHEN names columns, not the ADD VALUE label
-- `voided` (see enums.ts), and an ordinary event queues no deferred event (0022's TRUNCATE note).
CREATE CONSTRAINT TRIGGER work_session_events_repair_approved AFTER INSERT ON work_session_events
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.corrects_event_id IS NOT NULL OR NEW.voids_event_id IS NOT NULL)
  EXECUTE FUNCTION check_event_repair_approved();
