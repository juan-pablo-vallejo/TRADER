// The job page's "Not in this total" lines (PRD, Office review and job cost: pending and
// unpriced beside the cost, never folded in): which lines a `job.cost` answer yields, each
// carrying the server's figures untouched. The demo's first job is read here as the demo
// plans it (packages/api/src/demo/content.ts, EXPECTED_COST).
import { describe, expect, it } from "vitest";

import {
  apartFrom,
  nothingRecorded,
  type JobCost,
} from "../src/app/jobs/[jobId]/cost-view";

const ZERO: JobCost = {
  job: { id: "00000000-0000-7000-8000-000000000001", name: "Kitchen", status: "open" },
  timezone: "America/New_York",
  labor: {
    lines: [],
    approvedHundredths: 0,
    totals: [],
    unrated: { hundredths: 0, lines: 0 },
    pending: { hundredths: 0, sessions: 0, totals: [], unratedHundredths: 0 },
    rejectedSessions: 0,
    openSessions: 0,
  },
  materials: {
    totals: [],
    receipts: 0,
    unpriced: 0,
    pending: { totals: [], receipts: 0, unpriced: 0 },
    rejected: 0,
    voided: 0,
  },
  total: [],
};

const usd = (cents: number) => [{ currency: "USD", cents }];

describe("what stands beside a job's cost", () => {
  it("is nothing for a job with nothing recorded", () => {
    expect(apartFrom(ZERO)).toEqual([]);
    expect(nothingRecorded(ZERO)).toBe(true);
  });

  it("is one line per figure that is not zero, with the server's figures as given", () => {
    const one = (change: (c: JobCost) => void) => {
      const cost = structuredClone(ZERO);
      change(cost);
      expect(nothingRecorded(cost)).toBe(false);
      return apartFrom(cost);
    };
    expect(one((c) => (c.labor.unrated = { hundredths: 7200, lines: 9 }))).toEqual([
      { kind: "unrated", hundredths: 7200, lines: 9 },
    ]);
    expect(
      one(
        (c) =>
          (c.labor.pending = {
            hundredths: 1600,
            sessions: 2,
            totals: usd(44800),
            unratedHundredths: 0,
          }),
      ),
    ).toEqual([
      {
        kind: "pendingLabor",
        hundredths: 1600,
        sessions: 2,
        totals: usd(44800),
        unratedHundredths: 0,
      },
    ]);
    expect(one((c) => (c.labor.rejectedSessions = 1))).toEqual([
      { kind: "rejectedSessions", count: 1 },
    ]);
    expect(one((c) => (c.labor.openSessions = 3))).toEqual([
      { kind: "openSessions", count: 3 },
    ]);
    expect(one((c) => (c.materials.unpriced = 1))).toEqual([
      { kind: "unpricedReceipts", count: 1 },
    ]);
    expect(
      one((c) => (c.materials.pending = { totals: usd(4590), receipts: 1, unpriced: 0 })),
    ).toEqual([{ kind: "pendingReceipts", receipts: 1, totals: usd(4590), unpriced: 0 }]);
    expect(one((c) => (c.materials.rejected = 2))).toEqual([
      { kind: "rejectedReceipts", count: 2 },
    ]);
    expect(one((c) => (c.materials.voided = 1))).toEqual([
      { kind: "voidedReceipts", count: 1 },
    ]);
  });

  it("keeps a session waiting with no hours yet, and a pending receipt nobody priced", () => {
    const cost = structuredClone(ZERO);
    cost.labor.pending = { hundredths: 0, sessions: 1, totals: [], unratedHundredths: 0 };
    cost.materials.pending = { totals: [], receipts: 1, unpriced: 1 };
    expect(apartFrom(cost).map((l) => l.kind)).toEqual([
      "pendingLabor",
      "pendingReceipts",
    ]);
  });

  it("reads the demo's first job: labor first, then receipts, and nothing of the total", () => {
    const j1 = structuredClone(ZERO);
    j1.labor.approvedHundredths = 25450;
    j1.labor.totals = usd(499450);
    j1.labor.unrated = { hundredths: 7200, lines: 9 };
    j1.labor.pending = {
      hundredths: 1600,
      sessions: 2,
      totals: usd(44800),
      unratedHundredths: 0,
    };
    j1.labor.rejectedSessions = 1;
    j1.materials = {
      totals: usd(46178),
      receipts: 2,
      unpriced: 1,
      pending: { totals: usd(4590), receipts: 1, unpriced: 0 },
      rejected: 0,
      voided: 0,
    };
    j1.total = usd(545628);
    const lines = apartFrom(j1);
    expect(lines.map((l) => l.kind)).toEqual([
      "unrated",
      "pendingLabor",
      "rejectedSessions",
      "unpricedReceipts",
      "pendingReceipts",
    ]);
    // Counted receipts and the totals are the summary's, never a line beside it.
    expect(JSON.stringify(lines)).not.toContain("545628");
    expect(JSON.stringify(lines)).not.toContain("46178");
    expect(nothingRecorded(j1)).toBe(false);
  });
});
