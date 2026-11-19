// The database's enums as the phone needs them, restated: the contract imports nothing of
// the server, so it cannot read them from the schema. A test holds each list to the schema's
// own (test/contract/contract.test.ts): a member added there and not here fails it.
// Two roles. The database's enum keeps a third label until the baseline; nothing holds it
// (migration 0051) and `roleOf` reads any stored role as one of these two.
export const ROLES = ["admin", "worker"] as const;
export type Role = (typeof ROLES)[number];
export const roleOf = (stored: string): Role => (stored === "admin" ? "admin" : "worker");
export const JOB_STATUSES = ["open", "complete", "archived"] as const;
export const LABOR_EVENT_TYPES = [
  "started",
  "paused",
  "resumed",
  "ended",
  "voided",
] as const;
// What a device may record: a void is the office's.
export const DEVICE_EVENT_TYPES = ["started", "paused", "resumed", "ended"] as const;
export const ATTESTATION_LEVELS = ["biometric", "device_credential", "none"] as const;
export const APPROVAL_REASONS = [
  "offline",
  "corrected",
  "user_timed",
  "location",
  "clock_skewed",
  // Nothing computes it since day closeout left; the label leaves with the baseline.
  "after_closeout",
  "unscheduled",
] as const;
