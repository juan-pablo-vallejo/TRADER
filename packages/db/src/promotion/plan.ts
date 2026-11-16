// What one promotion of staging may do to its database (ARCHITECTURE, 2026-11-16, staging
// promotion and migration gate). Pure: the caller reads the journal and both databases'
// applied migrations and is told what to rehearse and whether staging may be migrated.
// A promotion a merge started migrates by itself only what the reading passes and only
// past the owner's gate; anything else waits for a dispatch by the repository's owner that
// names the last pending migration. Consumed by run-promotion.ts.
import type { MigrationFlag } from "./reading";

export type JournalEntry = {
  idx: number;
  tag: string;
  hash: string;
  flags: MigrationFlag[];
};

export type PromotionRequest =
  | { kind: "merge" }
  | {
      kind: "dispatch";
      mode: "rehearse-only" | "promote";
      byOwner: boolean;
      authorizeThrough: string | null;
    };

export type PromotionProblem =
  // The database holds a migration the journal does not, or holds them in another order.
  | "staging_not_of_this_journal"
  | "rehearsal_not_of_this_journal"
  // The rehearsal branch is behind staging: it no longer stands where staging does.
  | "rehearsal_behind_staging"
  // A dispatch named a migration other than the last one pending, or named one with
  // nothing to authorize, or was not the owner's.
  | "authorization_mismatch"
  | "authorization_not_by_owner";

export type Withheld = "rehearse_only" | "owner_gate" | "flagged";

export type PromotionPlan =
  | { ok: false; problem: PromotionProblem }
  | {
      ok: true;
      pending: JournalEntry[];
      toRehearse: JournalEntry[];
      // none: staging is at the journal. automatic and authorized: migrate it.
      // withheld: stop before staging changes.
      migrate: "none" | "automatic" | "authorized" | "withheld";
      withheld: Withheld[];
    };

// The backlog that stood on 2026-11-16 ends at 0049: nothing up to it is migrated without
// the owner's dispatch, whatever the reading says.
export const OWNER_GATED_THROUGH = 49;

const isPrefix = (applied: string[], journal: JournalEntry[]) =>
  applied.length <= journal.length &&
  applied.every((hash, i) => journal[i]?.hash === hash);

export function planPromotion(input: {
  journal: JournalEntry[];
  staging: string[];
  rehearsal: string[];
  request: PromotionRequest;
  gatedThrough?: number;
}): PromotionPlan {
  const { journal, staging, rehearsal, request } = input;
  const gatedThrough = input.gatedThrough ?? OWNER_GATED_THROUGH;
  if (!isPrefix(staging, journal)) {
    return { ok: false, problem: "staging_not_of_this_journal" };
  }
  if (!isPrefix(rehearsal, journal)) {
    return { ok: false, problem: "rehearsal_not_of_this_journal" };
  }
  if (rehearsal.length < staging.length) {
    return { ok: false, problem: "rehearsal_behind_staging" };
  }
  const pending = journal.slice(staging.length);
  const toRehearse = journal.slice(rehearsal.length);
  const last = pending.at(-1);
  const named = request.kind === "dispatch" ? request.authorizeThrough : null;
  if (named !== null) {
    if (request.kind !== "dispatch" || request.mode !== "promote") {
      return { ok: false, problem: "authorization_mismatch" };
    }
    if (!request.byOwner) return { ok: false, problem: "authorization_not_by_owner" };
    if (last === undefined || last.tag !== named) {
      return { ok: false, problem: "authorization_mismatch" };
    }
  }
  if (last === undefined) {
    return { ok: true, pending, toRehearse, migrate: "none", withheld: [] };
  }
  if (request.kind === "dispatch" && request.mode === "rehearse-only") {
    return {
      ok: true,
      pending,
      toRehearse,
      migrate: "withheld",
      withheld: ["rehearse_only"],
    };
  }
  const withheld: Withheld[] = [
    ...(pending.some((entry) => entry.idx <= gatedThrough)
      ? (["owner_gate"] as const)
      : []),
    ...(pending.some((entry) => entry.flags.length > 0) ? (["flagged"] as const) : []),
  ];
  if (withheld.length === 0) {
    return { ok: true, pending, toRehearse, migrate: "automatic", withheld };
  }
  if (named !== null) {
    return { ok: true, pending, toRehearse, migrate: "authorized", withheld: [] };
  }
  return { ok: true, pending, toRehearse, migrate: "withheld", withheld };
}
