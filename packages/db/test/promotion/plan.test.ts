// What a promotion may do to staging's database, for every way it can be asked
// (ARCHITECTURE, 2026-11-16, migration gate). No database.
import { describe, expect, it } from "vitest";

import {
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
) =>
  planPromotion({
    journal,
    staging: hashes(staging),
    rehearsal: hashes(rehearsal),
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

  it("migrates a withheld set on the owner's dispatch naming its last migration", () => {
    expect(
      plan(journalOf(5, { 3: ["drop"] }), 3, 3, dispatch("promote", "0004_m"), 4),
    ).toMatchObject({ ok: true, migrate: "authorized", withheld: [] });
  });

  it("refuses a dispatch that names any other migration", () => {
    for (const named of ["0003_m", "0005_m", "0004", "0004_M"]) {
      expect(
        plan(journalOf(5, { 3: ["drop"] }), 3, 3, dispatch("promote", named)),
      ).toEqual({ ok: false, problem: "authorization_mismatch" });
    }
  });

  it("refuses an authorization that is not the owner's", () => {
    expect(
      plan(journalOf(5, { 3: ["drop"] }), 3, 3, dispatch("promote", "0004_m", false)),
    ).toEqual({ ok: false, problem: "authorization_not_by_owner" });
  });

  it("refuses an authorization with nothing pending, or on a rehearsal", () => {
    expect(plan(journalOf(3), 3, 3, dispatch("promote", "0002_m"))).toEqual({
      ok: false,
      problem: "authorization_mismatch",
    });
    expect(plan(journalOf(4), 3, 3, dispatch("rehearse-only", "0003_m"))).toEqual({
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
        request: merge,
      }),
    ).toEqual({ ok: false, problem: "staging_not_of_this_journal" });
    expect(
      planPromotion({
        journal,
        staging: hashes(2),
        rehearsal: ["h0", "h1", "h2", "h3"],
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
