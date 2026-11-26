// The numbers the server, the office and the phone all go by, written once: the server's
// limits, and the defaults both clients fill in. A client reads them here so it never asks for
// more than the server takes.

// Calls the server answers in one request (apps/web server/handler.ts): a larger batch is
// refused whole, so both clients' batching links stop here.
export const MAX_BATCH_CALLS = 10;

// Records one sync.push carries (sync/push.ts). The phone sends its outbox this many at a
// time.
export const MAX_PUSH_RECORDS = 100;

// How long the phone waits for an answer before giving a call up, as it does one the
// network failed: one that never answered would hold every sync cycle behind it.
export const CALL_DEADLINE_MS = 25_000;

// A device clock this far from the server's is skewed (sync/flags.ts); exactly this far is
// not.
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;

// A jobsite's radius when its location is first set, unless the office types another; a
// location set from the phone takes it. The server takes any radius up to the ceiling below.
export const JOBSITE_RADIUS_M = 200;

// The largest radius a jobsite takes: 100 km is already no jobsite, and the column is a
// 32-bit integer.
export const MAX_JOBSITE_RADIUS_M = 100_000;

// The longest range of days one read of hours covers: any month.
export const MAX_RANGE_DAYS = 31;

// The days a pull carries entries and sessions for: today and the thirteen before. What is
// older is no longer on the phone's record, its own refusals included.
export const PULL_WINDOW_DAYS = 14;
