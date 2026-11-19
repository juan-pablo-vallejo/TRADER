// The database's enums as the phone needs them, restated: the contract imports nothing of
// the server, so it cannot read them from the schema. A test holds each list to the schema's
// own (test/contract/contract.test.ts): a member added there and not here fails it.
export const ROLES = ["admin", "worker"] as const;
export type Role = (typeof ROLES)[number];
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
export const ENTRY_FLAGS = [
  "offline",
  "corrected",
  "user_timed",
  "location",
  "clock_skewed",
  "unscheduled",
] as const;
