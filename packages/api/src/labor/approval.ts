// Whether a session counts toward payroll and job cost (PRD, Office approval: an entry that
// needs approval counts once approved; ARCHITECTURE, approval accounting). Pure: no database,
// no clock. Structure never depends on a decision: the session, its sources, its state and its
// work date are the fold's (replay), over every accepted event whatever its approval. Only the
// accounting reads decisions, and only of the events in effect for a session — its winning
// positional sources and its void; a superseded correction's decision is moot. Eligibility is
// not export readiness: an open session counts its closed intervals only, and is still open.
// Consumed by approvals/queue.ts; the payroll export and job cost (Stage 4).
import { LedgerInconsistentError, replay, type LaborEvent, type Replay } from "./fold";

// NULL is pending; an event with no approvals row is approved by default (absent from the map).
export type Decision = "approved" | "rejected" | null;

export type Accounting = "eligible" | "pending" | "rejected" | "voided";

export type SessionApproval = {
  rootEventId: string;
  accounting: Accounting;
  // Worked milliseconds that count: zero unless eligible.
  eligibleWorkedMs: number;
  // The fold's: an eligible session that is still open is not ready for export.
  complete: boolean;
};

type Status = "approved" | "rejected" | "pending";

const statusOf = (decisions: ReadonlyMap<string, Decision>, id: string): Status =>
  decisions.has(id) ? (decisions.get(id) ?? "pending") : "approved";

// A projection that drops voids must place every positional source exactly where the
// structural replay did: a void is never a positional entry and nothing legal references one
// (fold.ts). Anything else is a defect, never a business answer.
export function assertSameSessions(structural: Replay, projection: Replay): void {
  const sources = (r: Replay) =>
    new Map(r.sessions.map((s) => [s.rootEventId, s.eventSourceIds.join(",")]));
  const a = sources(structural);
  const b = sources(projection);
  const same =
    projection.violation === null &&
    a.size === b.size &&
    [...a].every(([root, ids]) => b.get(root) === ids);
  if (!same) throw new Error("the accounting projection moved a session's sources");
}

export function sessionApprovals(
  ledger: readonly LaborEvent[],
  decisions: ReadonlyMap<string, Decision>,
): { structural: Replay; byRoot: Map<string, SessionApproval> } {
  const structural = replay(ledger);
  if (structural.violation !== null)
    throw new LedgerInconsistentError(structural.violation);

  // At most one void per root in a legal ledger (already_voided).
  const voidOf = new Map<string, LaborEvent>();
  for (const e of ledger) {
    if (e.type === "voided" && e.voidsEventId !== null) voidOf.set(e.voidsEventId, e);
  }

  // A rejected void is disregarded for accounting and kept in history: its session's hours
  // come from the same replay without it, which differs only in `voided` and the durations
  // that flag zeroes.
  const rejectedVoids = new Set(
    [...voidOf.values()]
      .filter((v) => statusOf(decisions, v.id) === "rejected")
      .map((v) => v.id),
  );
  let projection = structural;
  if (rejectedVoids.size > 0) {
    projection = replay(ledger.filter((e) => !rejectedVoids.has(e.id)));
    assertSameSessions(structural, projection);
  }
  const projected = new Map(projection.sessions.map((s) => [s.rootEventId, s]));

  const byRoot = new Map<string, SessionApproval>();
  for (const s of structural.sessions) {
    const v = voidOf.get(s.rootEventId);
    const voidStatus = v === undefined ? null : statusOf(decisions, v.id);
    const sources = s.eventSourceIds.map((id) => statusOf(decisions, id));
    // The authorized precedence: an approved void, then a rejected source, then anything
    // pending, else eligible.
    const accounting: Accounting =
      voidStatus === "approved"
        ? "voided"
        : sources.includes("rejected")
          ? "rejected"
          : sources.includes("pending") || voidStatus === "pending"
            ? "pending"
            : "eligible";
    byRoot.set(s.rootEventId, {
      rootEventId: s.rootEventId,
      accounting,
      eligibleWorkedMs:
        accounting === "eligible" ? projected.get(s.rootEventId)!.workedMs : 0,
      complete: s.complete,
    });
  }
  return { structural, byRoot };
}

// Where one event's approval stands against the live timeline: its session, and whether it is
// what the session is judged on — the source in effect for its root, a superseded one, or the
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
