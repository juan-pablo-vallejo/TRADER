// What a promotion may do to staging's database, for every way it can be asked
// (ARCHITECTURE, 2026-11-16, migration gate). No database.
import { describe, expect, it } from "vitest";

import {
  approvalCode,
  OWNER_GATED_THROUGH,
  planPromotion,
  type JournalEntry,
  type PromotionRequest,
} from "../../src/promotion/plan";
import type { MigrationFlag } from "../../src/promotion/reading";

const entry = (idx: number, flags: MigrationFlag[] = []): JournalEntry => ({
  idx,
  tag: `${String(idx).padStart(4, "0")}_m`,
  hash: `h${idx}`,
  flags,
});
const journalOf = (n: number, flagged: Record<number, MigrationFlag[]> = {}) =>
  Array.from({ length: n }, (_, i) => entry(i, flagged[i] ?? []));
const hashes = (n: number) => Array.from({ length: n }, (_, i) => `h${i}`);

const COMMIT = "a".repeat(40);
const OTHER_COMMIT = "b".repeat(40);
// The code a report prints for `journal` with `staging` migrations applied, at `commit`.
const codeFor = (journal: JournalEntry[], staging: number, commit = COMMIT) =>
  approvalCode(commit, journal.slice(staging))!;

const merge: PromotionRequest = { kind: "merge" };
const dispatch = (
  mode: "rehearse-only" | "promote",
  authorizeThrough: string | null = null,
  byOwner = true,
): PromotionRequest => ({ kind: "dispatch", mode, byOwner, authorizeThrough });

// Past the owner's gate unless a test says otherwise.
const plan = (
  journal: JournalEntry[],
  staging: number,
  rehearsal: number,
  request: PromotionRequest,
  gatedThrough = -1,
  commit = COMMIT,
) =>
  planPromotion({
    journal,
    staging: hashes(staging),
    rehearsal: hashes(rehearsal),
    commit,
    request,
    gatedThrough,
  });

describe("planPromotion", () => {
  it("gates the backlog of 2026-11-16 through 0049", () => {
    expect(OWNER_GATED_THROUGH).toBe(49);
  });

  it("has nothing to migrate when staging is at the journal", () => {
    expect(plan(journalOf(3), 3, 3, merge)).toEqual({
      ok: true,
      pending: [],
      toRehearse: [],
      migrate: "none",
      withheld: [],
    });
  });

  it("migrates by itself what the reading passes, past the gate", () => {
    const result = plan(journalOf(4), 3, 3, merge);
    expect(result).toMatchObject({ ok: true, migrate: "automatic", withheld: [] });
    expect(result.ok && result.pending.map((e) => e.idx)).toEqual([3]);
    expect(result.ok && result.toRehearse.map((e) => e.idx)).toEqual([3]);
  });

  it("withholds a flagged migration on a merge", () => {
    expect(plan(journalOf(4, { 3: ["drop"] }), 3, 3, merge)).toMatchObject({
      ok: true,
      migrate: "withheld",
      withheld: ["flagged"],
    });
  });

  it("withholds everything behind a flagged migration with it", () => {
    expect(plan(journalOf(5, { 3: ["revoke"] }), 3, 3, merge)).toMatchObject({
      migrate: "withheld",
    });
  });

  it("withholds a migration at or under the owner's gate, flagged or not", () => {
    expect(plan(journalOf(4), 3, 3, merge, 3)).toMatchObject({
      migrate: "withheld",
      withheld: ["owner_gate"],
    });
    expect(plan(journalOf(4), 3, 3, dispatch("promote"), 3)).toMatchObject({
      migrate: "withheld",
      withheld: ["owner_gate"],
    });
  });

  it("names both reasons when both hold", () => {
    expect(plan(journalOf(4, { 3: ["drop"] }), 3, 3, merge, 3)).toMatchObject({
      withheld: ["owner_gate", "flagged"],
    });
  });

  it("migrates a withheld set on the owner's dispatch carrying the report's code", () => {
    const journal = journalOf(5, { 3: ["drop"] });
    expect(
      plan(journal, 3, 5, dispatch("promote", codeFor(journal, 3)), 4),
    ).toMatchObject({ ok: true, migrate: "authorized", withheld: [], toRehearse: [] });
  });

  it("prints a code of the last tag and twenty hex digits, and none with nothing pending", () => {
    expect(codeFor(journalOf(5), 3)).toMatch(/^0004_m\.[0-9a-f]{20}$/);
    expect(approvalCode(COMMIT, [])).toBeNull();
    expect(approvalCode("main", journalOf(5).slice(3))).toBeNull();
  });

  it("refuses the last migration's tag alone, and any other code", () => {
    const journal = journalOf(5, { 3: ["drop"] });
    const code = codeFor(journal, 3);
    for (const named of [
      "0004_m",
      "0003_m",
      code.toUpperCase(),
      `${code}0`,
      code.slice(0, -1),
    ]) {
      expect(plan(journal, 3, 5, dispatch("promote", named))).toEqual({
        ok: false,
        problem: "authorization_mismatch",
      });
    }
  });

  it("refuses a code printed for another commit", () => {
    const journal = journalOf(5);
    const code = codeFor(journal, 3, OTHER_COMMIT);
    expect(plan(journal, 3, 5, dispatch("promote", code))).toEqual({
      ok: false,
      problem: "authorization_mismatch",
    });
    expect(plan(journal, 3, 5, dispatch("promote", code), 4, OTHER_COMMIT)).toMatchObject(
      { ok: true, migrate: "authorized" },
    );
  });

  it("refuses a code printed for other content under the same tags", () => {
    const reviewed = journalOf(5);
    const code = codeFor(reviewed, 3);
    // The last pending file was edited after the report: same tag, another hash. The
    // databases hold only the three migrations before it.
    const edited = reviewed.map((e) => (e.idx === 4 ? { ...e, hash: "h4-edited" } : e));
    expect(
      planPromotion({
        journal: edited,
        staging: hashes(3),
        rehearsal: hashes(3),
        commit: COMMIT,
        request: dispatch("promote", code),
        gatedThrough: -1,
      }),
    ).toEqual({ ok: false, problem: "authorization_mismatch" });
  });

  it("refuses a code printed for another pending set", () => {
    const journal = journalOf(5);
    // Printed when staging stood at 2: three were pending then, two are now.
    expect(plan(journal, 3, 5, dispatch("promote", codeFor(journal, 2)))).toEqual({
      ok: false,
      problem: "authorization_mismatch",
    });
    // A migration added since: the code for the shorter journal no longer fits.
    expect(plan(journalOf(6), 3, 6, dispatch("promote", codeFor(journal, 3)))).toEqual({
      ok: false,
      problem: "authorization_mismatch",
    });
  });

  it("never rehearses and migrates in one authorized run", () => {
    const journal = journalOf(5);
    const code = codeFor(journal, 3);
    for (const rehearsal of [3, 4]) {
      expect(plan(journal, 3, rehearsal, dispatch("promote", code))).toEqual({
        ok: false,
        problem: "authorization_without_rehearsal",
      });
    }
  });

  it("refuses an authorization that is not the owner's", () => {
    const journal = journalOf(5, { 3: ["drop"] });
    expect(plan(journal, 3, 5, dispatch("promote", codeFor(journal, 3), false))).toEqual({
      ok: false,
      problem: "authorization_not_by_owner",
    });
  });

  it("refuses an authorization with nothing pending, or on a rehearsal", () => {
    expect(
      plan(journalOf(3), 3, 3, dispatch("promote", codeFor(journalOf(3), 2))),
    ).toEqual({
      ok: false,
      problem: "authorization_mismatch",
    });
    const journal = journalOf(4);
    expect(plan(journal, 3, 4, dispatch("rehearse-only", codeFor(journal, 3)))).toEqual({
      ok: false,
      problem: "authorization_mismatch",
    });
  });

  it("never migrates staging on a rehearse-only dispatch", () => {
    expect(plan(journalOf(4), 3, 3, dispatch("rehearse-only"))).toMatchObject({
      ok: true,
      migrate: "withheld",
      withheld: ["rehearse_only"],
    });
  });

  it("rehearses only what the rehearsal branch has not seen", () => {
    const result = plan(journalOf(6), 3, 5, merge);
    expect(result.ok && result.pending.map((e) => e.idx)).toEqual([3, 4, 5]);
    expect(result.ok && result.toRehearse.map((e) => e.idx)).toEqual([5]);
  });

  it("stops when a database holds what the journal does not", () => {
    const journal = journalOf(3);
    expect(
      planPromotion({
        journal,
        staging: ["h0", "other"],
        rehearsal: hashes(2),
        commit: COMMIT,
        request: merge,
      }),
    ).toEqual({ ok: false, problem: "staging_not_of_this_journal" });
    expect(
      planPromotion({
        journal,
        staging: hashes(2),
        rehearsal: ["h0", "h1", "h2", "h3"],
        commit: COMMIT,
        request: merge,
      }),
    ).toEqual({ ok: false, problem: "rehearsal_not_of_this_journal" });
  });

  it("stops when the rehearsal branch is behind staging", () => {
    expect(plan(journalOf(4), 3, 2, merge)).toEqual({
      ok: false,
      problem: "rehearsal_behind_staging",
    });
  });
});
