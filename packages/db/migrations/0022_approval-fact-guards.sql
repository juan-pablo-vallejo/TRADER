-- Guards for the approval facts of 0021. Created with `generate --custom`; drizzle-kit never
-- sees these objects. Every rule naming `after_closeout` (an ADD VALUE label, 0021) or any
-- other reason lives in plpgsql, which resolves the literal at run time (see enums.ts).
--
-- An original receipt's approval (PRD, Office approval: nobody approves their own entries):
-- written pending, by the push that records the receipt, and never decided by its logger. The
-- receipt is looked up under the caller's RLS; not finding it refuses, so the rule fails closed
-- without a tenant. A sibling of 0020's check_material_approval_decider, which governs
-- corrections and returns early for every other subject. Who may decide at all is the approval
-- queue's (a later Stage 3 line).
CREATE FUNCTION check_material_receipt_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  logger uuid;
BEGIN
  IF NEW.material_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.decision IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: a receipt''s approval is written pending',
      CONSTRAINT = 'approvals_material_receipt_born_pending';
  END IF;
  SELECT m.logged_by_user_id INTO logger
  FROM materials m
  WHERE m.company_id = NEW.company_id AND m.id = NEW.material_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: the receipt is not visible',
      CONSTRAINT = 'approvals_material_receipt_visible';
  END IF;
  IF NEW.decided_by_user_id IS NOT NULL AND NEW.decided_by_user_id = logger THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'approvals: nobody decides their own receipt',
      CONSTRAINT = 'approvals_material_receipt_not_self_decided';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER approvals_material_receipt BEFORE INSERT OR UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION check_material_receipt_approval();
--> statement-breakpoint
-- An entry whose own columns trigger the approval rule has, at commit, an approval holding
-- every reason they imply: `offline` for captured_offline, `user_timed` for time_set_by_user
-- (events only), `clock_skewed` for clock_skewed. The reasons computed in the API from other
-- rows — `location`, `after_closeout`, `corrected` — are its tests' to prove; this proves the
-- row and its approval are one write. Deferred, because the entry is inserted before the
-- approval naming it; a caller that must see the fault first says SET CONSTRAINTS … IMMEDIATE.
-- Runs under the caller's RLS, which suffices: the approval carries the entry's company_id
-- through its composite foreign key.
CREATE FUNCTION check_entry_approved() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  needed approval_reason[] := '{}';
  subject text := TG_ARGV[0];
BEGIN
  IF NEW.captured_offline THEN
    needed := needed || 'offline'::approval_reason;
  END IF;
  -- Nested, not AND: plpgsql resolves NEW.<column> when the expression runs, and materials
  -- have no time_set_by_user (42703).
  IF subject = 'event' THEN
    IF NEW.time_set_by_user THEN
      needed := needed || 'user_timed'::approval_reason;
    END IF;
  END IF;
  IF NEW.clock_skewed THEN
    needed := needed || 'clock_skewed'::approval_reason;
  END IF;
  IF cardinality(needed) = 0 THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM approvals a
    WHERE a.company_id = NEW.company_id
      AND (CASE WHEN subject = 'event' THEN a.event_id ELSE a.material_id END) = NEW.id
      AND a.reasons @> needed
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = format('%s: the entry needs an approval holding %s', TG_TABLE_NAME, needed),
      CONSTRAINT = TG_TABLE_NAME || '_approved';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- WHEN, so an entry no column flags queues no deferred event: a pending one would make
-- TRUNCATE fail 55006 before the append-only guard answers (0002's tests), and costs a row.
CREATE CONSTRAINT TRIGGER work_session_events_approved AFTER INSERT ON work_session_events
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.captured_offline OR NEW.time_set_by_user OR NEW.clock_skewed)
  EXECUTE FUNCTION check_entry_approved('event');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER materials_approved AFTER INSERT ON materials
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.captured_offline OR NEW.clock_skewed)
  EXECUTE FUNCTION check_entry_approved('material');
