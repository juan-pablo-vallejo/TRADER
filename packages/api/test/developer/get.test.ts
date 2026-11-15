// TASKS D01: developer.get (developer/get.ts) — what it answers for the caller's company,
// that it answers nothing of another's, and that it writes nothing. Rolled-back
// transactions; the gate is the inventory's (core/gates.test.ts).
import { auditLog, companies, syncDiagnostics } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { configuredStatus } from "../../src/core/status";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  type CrewDay,
  crewDayIn,
  ownerDb,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const refusal = (
  d: CrewDay,
  code: string,
  age: string,
  userId: string | null = d.w1,
) => ({
  companyId: d.companyId,
  userId: userId ?? d.w1,
  requestId: crypto.randomUUID(),
  recordId: uuidv7(),
  recordKind: "labor_event",
  outcome: "rejected" as const,
  code,
  createdAt: sql`now() - ${age}::interval`,
});

describe("configuredStatus", () => {
  it("reads the mode and the minimum builds as the service does", () => {
    expect(configuredStatus({})).toEqual({
      mode: "normal",
      minimumBuilds: { ios: 1, android: 1 },
    });
    expect(
      configuredStatus({
        TRADER_SYNC_MODE: "read_only",
        TRADER_MIN_BUILD_IOS: "42",
        TRADER_MIN_BUILD_ANDROID: "7",
      }),
    ).toEqual({ mode: "read_only", minimumBuilds: { ios: 42, android: 7 } });
    // Something the service does not know is not passed off as a mode or a build.
    expect(
      configuredStatus({ TRADER_SYNC_MODE: "off", TRADER_MIN_BUILD_IOS: "v2" }),
    ).toEqual({ mode: null, minimumBuilds: { ios: null, android: 1 } });
  });
});

describe("developer.get", () => {
  it("answers the switches, the role and the caller's own refused entries, newest first", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const other = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      await tx.insert(syncDiagnostics).values([
        refusal(d, "not_permitted", "2 hours"),
        refusal(d, "not_scheduled", "5 minutes"),
        refusal(d, "time_in_future", "3 days"),
        // Past the retention period: not the office's to read any more.
        refusal(d, "session_already_open", "31 days"),
      ]);
      await tx
        .insert(syncDiagnostics)
        .values({ ...refusal(other, "id_conflict", "1 minute"), userId: other.w1 });
      await tx
        .update(companies)
        .set({ scheduleEnforced: true })
        .where(eq(companies.id, other.companyId));
      vi.stubEnv("TRADER_SYNC_MODE", "paused");
      vi.stubEnv("TRADER_MIN_BUILD_IOS", "12");
      vi.stubEnv("TRADER_MIN_BUILD_ANDROID", "");
      await becomeApp(tx);
      const view = await appCallerIn(tx, admin.who).developer.get();
      expect(view).toMatchObject({
        sync: {
          mode: "paused",
          minimumBuilds: { ios: 12, android: 1 },
          protocol: { min: 1, max: 1 },
        },
        // The other company's switch is on; this one's is not.
        scheduleEnforced: false,
        databaseRole: "trader_app",
        refusals: { retained: 3, lastDay: 2 },
      });
      expect(view.refusals.recent.map((r) => r.code)).toEqual([
        "not_scheduled",
        "not_permitted",
        "time_in_future",
      ]);
      expect(view.refusals.recent[0]).toMatchObject({
        employee: expect.any(String),
        recordKind: "labor_event",
        outcome: "rejected",
      });
    });
  });

  it("writes nothing: no audit row, no diagnostic line", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      await becomeApp(tx);
      await appCallerIn(tx, admin.who).developer.get();
      await tx.execute(sql`reset role`);
      expect(await tx.$count(auditLog, eq(auditLog.companyId, d.companyId))).toBe(0);
      expect(
        await tx.$count(syncDiagnostics, eq(syncDiagnostics.companyId, d.companyId)),
      ).toBe(0);
    });
  });
});
