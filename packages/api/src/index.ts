export { appRouter, type AppRouter } from "./routers/_app";
export {
  createContext,
  PROVISIONAL_USER_NAME,
  type AppUser,
  type AuthIdentity,
  type Context,
} from "./context";
/**
 * The sync surface both clients need. The fold and the derivations are exported
 * because DERIVE-6 lets a device compute the same values for display — using the
 * identical code, so a disagreement can only be a data difference, never a
 * reimplementation drifting from the server's.
 */
export {
  checkLegality,
  compareEvents,
  foldSessions,
  openSession,
  orderEvents,
  type FoldEvent,
  type Legality,
  type Session,
} from "./sync/fold";
export {
  deriveSessions,
  payrollByWorkDate,
  workDate,
  type DerivedSession,
} from "./sync/derive";
export {
  clockSkewMs,
  isClockTrusted,
  retryDelayMs,
  rewindCursor,
  CLOCK_SKEW_TOLERANCE_MS,
  PULL_BATCH_SIZE,
  PULL_OVERLAP_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  type PullCursor,
} from "./sync/protocol";
export type { PushResult } from "./routers/sync";
export {
  adminProcedure,
  createCallerFactory,
  foremanProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./trpc";
