// Stage 4, V1-D04: diagnostic.list (sync/diagnostics.ts) through the application's router,
// against Postgres, in rolled-back owner transactions as trader_app. The lines are written by
// the owner here, at chosen times: what a push writes is push-commit.test.ts's. What the read
// must hold to: one caller, one day in the company's zone, nothing expired, nothing of another
// company, and nobody but an admin.
import { syncDiagnostics } from "@trader/db/schema";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import { workDate } from "../../src/labor/work-date";
import { LIST_LIMIT, RETENTION_DAYS } from "../../src/sync/diagnostics";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  companyIn,
  ownerDb,
  rejection,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const NY = "America/New_York";
const DAY = 86_400_000;

// A line received at `at`, written by the owner: created_at is the server's, so only the
// owner can place one in the past.
async function line(
  tx: Tx,
  companyId: string,
  userId: string,
  at: Date,
  code = "time_in_future",
) {
  const recordId = uuidv7();
  await tx.insert(syncDiagnostics).values({
    companyId,
    userId,
    requestId: crypto.randomUUID(),
    recordId,
    recordKind: "labor_event",
    outcome: "rejected",
    code,
    createdAt: at,
  });
  return recordId;
}

async function world(tx: Tx) {
  const c = await companyIn(tx, "admin");
  const worker = await boundIn(tx, c.companyId, "worker");
  const foreman = await boundIn(tx, c.companyId, "foreman");
  return { ...c, worker, foreman };
}

describe("diagnostic.list", () => {
  it("finds a worker's refusals on a day, newest first, with nothing but the line", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const now = new Date();
      const today = workDate(now, NY);
      const earlier = await line(
        tx,
        d.companyId,
        d.worker.id,
        new Date(now.getTime() - 2_000),
      );
      const later = await line(tx, d.companyId, d.worker.id, now, "not_permitted");
      await line(tx, d.companyId, d.foreman.id, now);
      await becomeApp(tx);
      const found = await appCallerIn(tx, d.who).diagnostic.list({
        userId: d.worker.id,
        day: today,
      });
      expect(found.map((l) => [l.recordId, l.code])).toEqual([
        [later, "not_permitted"],
        [earlier, "time_in_future"],
      ]);
      expect(Object.keys(found[0]!).sort()).toEqual([
        "code",
        "outcome",
        "receivedAt",
        "recordId",
        "recordKind",
        "requestId",
      ]);
    });
  });

  it("reads the day in the company's zone, not UTC", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      // 03:30 UTC is the evening before in New York, in either half of the year. Yesterday's,
      // so it is never in the future.
      const utcDay = new Date(Date.now() - DAY).toISOString().slice(0, 10);
      const at = new Date(`${utcDay}T03:30:00Z`);
      const id = await line(tx, d.companyId, d.worker.id, at);
      await becomeApp(tx);
      const on = async (day: string) =>
        (await appCallerIn(tx, d.who).diagnostic.list({ userId: d.worker.id, day })).map(
          (l) => l.recordId,
        );
      expect(workDate(at, NY)).not.toBe(utcDay);
      expect(await on(workDate(at, NY))).toEqual([id]);
      expect(await on(utcDay)).toEqual([]);
    });
  });

  it("never returns an expired line, deleted yet or not", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const kept = new Date(Date.now() - (RETENTION_DAYS - 1) * DAY);
      const gone = new Date(Date.now() - (RETENTION_DAYS + 1) * DAY);
      const keptId = await line(tx, d.companyId, d.worker.id, kept);
      await line(tx, d.companyId, d.worker.id, gone);
      await becomeApp(tx);
      const on = async (at: Date) =>
        (
          await appCallerIn(tx, d.who).diagnostic.list({
            userId: d.worker.id,
            day: workDate(at, NY),
          })
        ).map((l) => l.recordId);
      expect(await on(kept)).toEqual([keptId]);
      // Still in the table (nothing has written since), and still not answered.
      expect(await on(gone)).toEqual([]);
    });
  });

  it("answers at most the limit", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      await tx.execute(sql`
        insert into sync_diagnostics (company_id, user_id, request_id, outcome, code)
        select ${d.companyId}, ${d.worker.id}, gen_random_uuid(), 'request_failed', 'bad_request'
        from generate_series(1, ${LIST_LIMIT + 5})
      `);
      await becomeApp(tx);
      const found = await appCallerIn(tx, d.who).diagnostic.list({
        userId: d.worker.id,
        day: workDate(new Date(), NY),
      });
      expect(found).toHaveLength(LIST_LIMIT);
    });
  });

  it("shows another company's admin nothing, even by the worker's id", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const other = await world(tx);
      const now = new Date();
      await line(tx, d.companyId, d.worker.id, now);
      await becomeApp(tx);
      const found = await appCallerIn(tx, other.who).diagnostic.list({
        userId: d.worker.id,
        day: workDate(now, NY),
      });
      expect(found).toEqual([]);
    });
  });

  it("is refused to a worker and a foreman, their own lines included", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      await line(tx, d.companyId, d.worker.id, new Date());
      await becomeApp(tx);
      for (const who of [d.worker, d.foreman]) {
        const error = await rejection(
          appCallerIn(tx, who.who).diagnostic.list({
            userId: who.id,
            day: workDate(new Date(), NY),
          }),
        );
        expect(error.code).toBe("FORBIDDEN");
      }
    });
  });

  it("refuses anything but a user id and a calendar day", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      await becomeApp(tx);
      const list = appCallerIn(tx, d.who).diagnostic.list;
      for (const input of [
        { userId: d.worker.id, day: "yesterday" },
        { userId: "w1", day: "2026-11-11" },
        { userId: d.worker.id, day: "2026-11-11", companyId: d.companyId },
      ]) {
        expect((await rejection(list(input as never))).code).toBe("BAD_REQUEST");
      }
    });
  });
});
