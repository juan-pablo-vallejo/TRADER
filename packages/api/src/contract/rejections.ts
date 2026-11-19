// Every code a labor record can be refused with: what the phone
// keeps a record under when the server will never take it. Restated here because the
// contract imports nothing of the server; a type test holds the list to the server's own
// union (test/contract/contract.test.ts). A code this list does not know is still a refusal:
// the phone shows it as one and never retries it.
export const LABOR_REJECTION_CODES = [
  // The timeline would be illegal with the event in it (labor/fold.ts, labor/validate.ts).
  "no_open_session",
  "session_already_open",
  "not_paused",
  "already_paused",
  "target_missing",
  "target_is_correction",
  "correction_of_void",
  "correction_type_mismatch",
  "correction_job_mismatch",
  "void_target_not_started",
  "already_voided",
  "breaks_following_event",
  "correction_superseded",
  "correction_moves_session",
  "job_id_mismatch",
  // The record itself (sync/labor.ts).
  "id_conflict",
  "not_permitted",
  "time_in_future",
  "not_scheduled",
] as const;

export type LaborRejectionCode = (typeof LABOR_REJECTION_CODES)[number];
