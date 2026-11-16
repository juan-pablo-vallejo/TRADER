// core/rate-limit.ts against Postgres: a fixed window counted in one statement, a key that
// is a hash, and ended windows dropped. Rolled-back transactions: the transaction stands in
// for the pool, and its clock is frozen at its start, so every hit of a test is in one
// window unless the test moves the rows.
import { rateLimitWindows } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { hitRateLimit, rateKey } from "../../src/core/rate-limit";
import { ownerDb, rolledBack } from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const rule = { scope: "address", limit: 3, windowSeconds: 60 };
// A value no other suite's run counts.
const caller = () =>
  `203.0.113.${Math.floor(Math.random() * 250)}:${crypto.randomUUID()}`;

describe("hitRateLimit", () => {
  it("allows the limit and refuses what comes after it, saying how long to wait", async () => {
    await rolledBack(owner, async (tx) => {
      const who = caller();
      const verdicts = [];
      for (let i = 0; i < 5; i++) verdicts.push(await hitRateLimit(tx, rule, who));
      expect(verdicts.map((v) => v.limited)).toEqual([false, false, false, true, true]);
      for (const v of verdicts) {
        expect(v.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        expect(v.retryAfterSeconds).toBeLessThanOrEqual(60);
      }
    });
  });

  it("counts each caller and each scope on its own", async () => {
    await rolledBack(owner, async (tx) => {
      const a = caller();
      const b = caller();
      for (let i = 0; i < 3; i++) await hitRateLimit(tx, rule, a);
      expect((await hitRateLimit(tx, rule, a)).limited).toBe(true);
      expect((await hitRateLimit(tx, rule, b)).limited).toBe(false);
      expect((await hitRateLimit(tx, { ...rule, scope: "identity" }, a)).limited).toBe(
        false,
      );
    });
  });

  it("stores a hash and a count, and nothing of who called", async () => {
    await rolledBack(owner, async (tx) => {
      const who = caller();
      await hitRateLimit(tx, rule, who);
      await hitRateLimit(tx, rule, who);
      const rows = await tx
        .select()
        .from(rateLimitWindows)
        .where(eq(rateLimitWindows.key, rateKey("address", who)));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ count: 2 });
      expect(rows[0]!.key).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain("203.0.113");
      // The window starts on a boundary of its length.
      expect(rows[0]!.windowStart.getTime() % 60_000).toBe(0);
    });
  });

  it("starts again in a new window, and drops windows that ended an hour ago", async () => {
    await rolledBack(owner, async (tx) => {
      const who = caller();
      for (let i = 0; i < 4; i++) await hitRateLimit(tx, rule, who);
      // The same rows, moved back: the window just counted ended two hours ago.
      await tx.execute(sql`
        update rate_limit_windows set window_start = window_start - interval '2 hours'
        where key = ${rateKey("address", who)}
      `);
      expect((await hitRateLimit(tx, rule, who)).limited).toBe(false);
      const rows = await tx
        .select({ count: rateLimitWindows.count })
        .from(rateLimitWindows)
        .where(eq(rateLimitWindows.key, rateKey("address", who)));
      expect(rows).toEqual([{ count: 1 }]);
    });
  });

  it("refuses a rule that limits nothing", async () => {
    await rolledBack(owner, async (tx) => {
      await expect(hitRateLimit(tx, { ...rule, limit: 0 }, "x")).rejects.toThrow();
      await expect(
        hitRateLimit(tx, { ...rule, windowSeconds: 0.5 }, "x"),
      ).rejects.toThrow();
    });
  });
});
