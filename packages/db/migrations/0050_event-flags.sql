-- An entry's flags are written with the entry and every accepted entry counts at once: the
-- approval queue is gone. Two things only. The column is added with a default, so no row is
-- rewritten and the append-only trigger is never asked; rows already there keep no flags.
ALTER TABLE "work_session_events" ADD COLUMN "flags" "approval_reason"[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
-- The two deferred checks that required an approvals row at commit (0022, 0026).
DROP TRIGGER work_session_events_approved ON work_session_events;
--> statement-breakpoint
DROP TRIGGER work_session_events_repair_approved ON work_session_events;
