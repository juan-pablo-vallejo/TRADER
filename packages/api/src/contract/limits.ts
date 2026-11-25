// The numbers the server, the office and the phone all go by, written once. Each is the
// server's limit or default; a client reads it here so it can never ask for more than the
// server takes, or show something the server would not do.

// Calls the server answers in one request (apps/web server/handler.ts): a larger batch is
// refused whole, so both clients' batching links stop here.
export const MAX_BATCH_CALLS = 10;

// Records one sync.push carries (sync/push.ts). The phone sends its outbox this many at a
// time.
export const MAX_PUSH_RECORDS = 100;

// How long the phone waits for an answer before giving a call up, as it does one the
// network failed: one that never answered would hold every sync cycle behind it.
export const CALL_DEADLINE_MS = 25_000;

// A device clock this far from the server's is skewed (sync/reasons.ts); exactly this far is
// not.
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;

// A jobsite's radius unless the office sets another; a location set from the phone takes it.
export const JOBSITE_RADIUS_M = 200;

// The largest radius a jobsite takes: 100 km is already no jobsite, and the column is a
// 32-bit integer.
export const MAX_JOBSITE_RADIUS_M = 100_000;

// The longest range of days one read of hours covers: any month.
export const MAX_RANGE_DAYS = 31;
