/**
 * Protocol types shared by the server handler and both clients.
 *
 * They live here, not beside the router, because the router imports the database
 * — and anything a device imports must not drag a Postgres driver into a phone.
 * See `sync/index.ts` for why that boundary is a package export rather than a
 * convention.
 */

export type PushResult =
  | { id: string; status: "accepted" }
  /** CONFLICT-1: a repeat of an already-recorded id is a no-op that succeeds. */
  | { id: string; status: "duplicate" }
  /** SESSION-4: rejected at the boundary and never written. */
  | { id: string; status: "rejected"; reason: string; conflictingEventId?: string };

export type PushResponse = { results: PushResult[]; skewMs: number };
