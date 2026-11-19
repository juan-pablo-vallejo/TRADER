// Whether a session counts toward hours. Pure: no database, no clock. Every accepted event
// counts at once: a session counts unless a void names it, and a voided session counts
// nothing. An open session counts its closed intervals only, and is still open. Flags are
// evidence for the office (sync/reasons.ts) and change nothing here. Consumed by
// labor/ledger.ts and labor/day-hours.ts, which sums what counts for every hours figure.
import { LedgerInconsistentError, replay, type LaborEvent, type Replay } from "./fold";

export type Accounting = "eligible" | "voided";

export type SessionAccounting = {
  rootEventId: string;
  accounting: Accounting;
  // Worked milliseconds that count: zero when voided.
  eligibleWorkedMs: number;
  // The fold's: a session that is still open has no clock-out yet.
  complete: boolean;
};

export function sessionAccounting(ledger: readonly LaborEvent[]): {
  structural: Replay;
  byRoot: Map<string, SessionAccounting>;
} {
  const structural = replay(ledger);
  if (structural.violation !== null)
    throw new LedgerInconsistentError(structural.violation);
  const byRoot = new Map<string, SessionAccounting>();
  for (const s of structural.sessions) {
    byRoot.set(s.rootEventId, {
      rootEventId: s.rootEventId,
      accounting: s.voided ? "voided" : "eligible",
      eligibleWorkedMs: s.voided ? 0 : s.workedMs,
      complete: s.complete,
    });
  }
  return { structural, byRoot };
}

// Where one event stands against the live timeline: its session, and whether it is
// what the session is made of — the source in effect for its root, a superseded one, or the
// session's void. Every accepted event maps; one that does not means an inconsistent ledger.
export type EventEffect = {
  sessionRootEventId: string;
  effect: "in_effect" | "superseded" | "void";
};

export function eventEffect(structural: Replay, e: LaborEvent): EventEffect {
  const root = e.type === "voided" ? e.voidsEventId : (e.correctsEventId ?? e.id);
  const winner = root === null ? undefined : structural.winners.get(root);
  const session = winner === undefined ? undefined : structural.sessionOf.get(winner);
  if (session === undefined) {
    throw new Error(`labor event ${e.id} maps to no session`);
  }
  return {
    sessionRootEventId: session,
    effect: e.type === "voided" ? "void" : winner === e.id ? "in_effect" : "superseded",
  };
}
