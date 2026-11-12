-- An admin's own labor needs no approval (PRD, Office approval; ARCHITECTURE, V1-D10 as
-- amended): no approvals row is written for it, so the two deferred checks that require one
-- — 0022's check_entry_approved for an event's flag columns, 0026's
-- check_event_repair_approved for a correction or a void — stand down for it. A constraint
-- relaxation (invariant 8); nothing is dropped and no stored row changes. Created with
-- `generate --custom`; drizzle-kit never sees these objects.
--
-- The rule, the same as the API's (sync/labor.ts, labor/repair.ts): the event's worker is an
-- admin, and it was not written by a different admin. So an admin's own push, a foreman's
-- push for a crew member who is an admin, and an admin's repair of their own ledger need
-- nothing; a repair one admin writes for another is a repair of another person and needs its
-- approval as before. Roles are read when the check runs, which is at commit: every writer
-- holds the rows it relies on until then (push locks the caller and the worker FOR SHARE, a
-- repair locks its caller), so the role read here is the role at receipt. Read under the
-- caller's RLS: a user it cannot see is no admin, so the rule fails closed without a tenant.
-- An approvals row for such an event stays legal: the ones written before this migration,
-- and a later role change, move nothing. `admin` was created with the type (0000).
CREATE FUNCTION labor_event_needs_no_approval(company uuid, worker uuid, initiator uuid)
  RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.company_id = company AND u.id = worker AND u.role = 'admin'
  ) THEN
    RETURN false;
  END IF;
  IF initiator = worker THEN
    RETURN true;
  END IF;
  -- Another person wrote it. Not found counts as an admin: refuse what cannot be read.
  RETURN EXISTS (
    SELECT 1 FROM users u
    WHERE u.company_id = company AND u.id = initiator AND u.role <> 'admin'
  );
END;
$$;
--> statement-breakpoint
-- 0022's function, with the event branch standing down for an admin's own labor. Receipts
-- are untouched: a receipt is never decided by its logger, whoever they are.
CREATE OR REPLACE FUNCTION check_entry_approved() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  needed approval_reason[] := '{}';
  subject text := TG_ARGV[0];
BEGIN
  IF NEW.captured_offline THEN
    needed := needed || 'offline'::approval_reason;
  END IF;
  -- Nested, not AND: plpgsql resolves NEW.<column> when the expression runs, and materials
  -- have no time_set_by_user, worker_id or initiator_user_id (42703).
  IF subject = 'event' THEN
    IF labor_event_needs_no_approval(NEW.company_id, NEW.worker_id, NEW.initiator_user_id) THEN
      RETURN NULL;
    END IF;
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
-- 0026's function, standing down the same way. Only an admin writes a correction or a void,
-- so here the rule comes to: the admin's own.
CREATE OR REPLACE FUNCTION check_event_repair_approved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF labor_event_needs_no_approval(NEW.company_id, NEW.worker_id, NEW.initiator_user_id) THEN
    RETURN NULL;
  END IF;
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
