// What one promotion of staging may do to its database (ARCHITECTURE, 2026-11-16, staging
// promotion and migration gate). Pure: the caller reads the journal and both databases'
// applied migrations and is told what to rehearse and whether staging may be migrated.
// A promotion a merge started migrates by itself only what the reading passes and only
// past the owner's gate; anything else waits for a dispatch by the repository's owner that
// carries the approval code a rehearsal's report printed: the last pending migration's tag
// and a digest of the commit and of every pending migration's tag and content hash. So an
// approval holds for one commit and one set of files, and for nothing read since. An
// authorized run never rehearses: the rehearsal branch must already hold the journal, from
// an earlier run whose report the owner read. Consumed by run-promotion.ts.
import { createHash } from "node:crypto";

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
  // A dispatch carried a code other than this commit's and this pending set's, or one
  // with nothing to authorize, or was not the owner's.
  | "authorization_mismatch"
  | "authorization_not_by_owner"
  // An authorized dispatch found migrations the rehearsal branch has not applied: there is
  // no earlier rehearsal of this journal to have approved.
  | "authorization_without_rehearsal";

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

export const isCommit = (value: string) => /^[0-9a-f]{40}$/.test(value);

// The code an owner's dispatch must carry to migrate `pending` at `commit`. Twenty hex
// digits of the digest: it is a binding, not a secret — the gate is who dispatches.
export function approvalCode(commit: string, pending: JournalEntry[]): string | null {
  const last = pending.at(-1);
  if (last === undefined || !isCommit(commit)) return null;
  const digest = createHash("sha256")
    .update([commit, ...pending.map((entry) => `${entry.tag} ${entry.hash}`)].join("\n"))
    .digest("hex");
  return `${last.tag}.${digest.slice(0, 20)}`;
}

const isPrefix = (applied: string[], journal: JournalEntry[]) =>
  applied.length <= journal.length &&
  applied.every((hash, i) => journal[i]?.hash === hash);

export function planPromotion(input: {
  journal: JournalEntry[];
  staging: string[];
  rehearsal: string[];
  // The commit being promoted, forty hex digits.
  commit: string;
  request: PromotionRequest;
  gatedThrough?: number;
}): PromotionPlan {
  const { journal, staging, rehearsal, commit, request } = input;
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
  const named = request.kind === "dispatch" ? request.authorizeThrough : null;
  if (named !== null) {
    if (request.kind !== "dispatch" || request.mode !== "promote") {
      return { ok: false, problem: "authorization_mismatch" };
    }
    if (!request.byOwner) return { ok: false, problem: "authorization_not_by_owner" };
    const code = approvalCode(commit, pending);
    if (code === null || code !== named) {
      return { ok: false, problem: "authorization_mismatch" };
    }
    if (toRehearse.length > 0) {
      return { ok: false, problem: "authorization_without_rehearsal" };
    }
  }
  if (pending.length === 0) {
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
