-- A labor event's approval (PRD, Office approval: nobody approves their own entries): written
-- pending, by the push that records the event, and never decided by the worker whose labor it
-- is. The initiator — a foreman recording crew labor, the office repairing it — is not excluded:
-- the rule is the worker's own hours (ARCHITECTURE, approval queue). Created with
-- `generate --custom`; drizzle-kit never sees these objects. The third sibling of 0020's
-- check_material_approval_decider and 0022's check_material_receipt_approval, each returning
-- early for every other subject. The event is looked up under the caller's RLS; not finding it
-- refuses, so the rule fails closed without a tenant. Who may decide at all is the API's
-- (approval.decide, an active admin).
CREATE FUNCTION check_event_approval_decider() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  worker uuid;
BEGIN
  IF NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.decision IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: an event''s approval is written pending',
      CONSTRAINT = 'approvals_event_born_pending';
  END IF;
  SELECT e.worker_id INTO worker
  FROM work_session_events e
  WHERE e.company_id = NEW.company_id AND e.id = NEW.event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: the event is not visible',
      CONSTRAINT = 'approvals_event_visible';
  END IF;
  IF NEW.decided_by_user_id IS NOT NULL AND NEW.decided_by_user_id = worker THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: nobody decides their own labor',
      CONSTRAINT = 'approvals_event_not_self_decided';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER approvals_event_decider BEFORE INSERT OR UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION check_event_approval_decider();
