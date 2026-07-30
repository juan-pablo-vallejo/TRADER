/**
 * The sync logic, with **no server dependencies** — importable from a phone.
 *
 * This exists as a separate entry point (`@trader/api/sync`) rather than living
 * behind the package root because of a hard constraint, not tidiness. The root
 * barrel re-exports `createContext`, which imports `@trader/db`, which imports
 * `pg` — and Metro follows value imports, so a device importing the fold through
 * the root pulls the Postgres driver into the app bundle and the build dies on
 * `require('events')`.
 *
 * DERIVE-6 permits a device to compute the same derived values for display, and
 * the whole point of allowing that is to run the *same code* on both sides, so a
 * disagreement can only be a data difference and never two implementations
 * drifting apart. That requires this boundary to exist.
 *
 * **Nothing re-exported here may import the database, the router, or tRPC.**
 */

export {
  checkLegality,
  compareEvents,
  foldSessions,
  isTerminal,
  openSession,
  orderEvents,
  type EventType,
  type FoldEvent,
  type Legality,
  type Session,
} from "./fold";

export {
  deriveSessions,
  payrollByWorkDate,
  workDate,
  type DerivedSession,
} from "./derive";

export {
  clockSkewMs,
  isClockTrusted,
  retryDelayMs,
  rewindCursor,
  CLOCK_SKEW_TOLERANCE_MS,
  NIL_UUID,
  PULL_BATCH_SIZE,
  PULL_OVERLAP_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  type PullCursor,
} from "./protocol";

export type { PushResponse, PushResult } from "./types";
