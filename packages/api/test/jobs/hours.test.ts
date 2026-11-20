// job.list's hours per job: this week and to date, from the one labor derivation, in the
// company's own week. Every test runs in an owner transaction that is always rolled back,
// each read as trader_app.
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { listJobsWithHours } from "../../src/jobs/hours";
import {
  appCallerIn,
  asTenant,
  boundIn,
  eventIn,
  ownerDb,
  rolledBack,
  workDayIn,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

// Wednesday 18 November 2026 in New York (UTC-5): its week is Monday the 16th to Sunday
// the 22nd.
const NOW = new Date("2026-11-18T15:00:00-05:00");
const at = (day: string, wall: string) => `${day}T${wall}:00-05:00`;

async function world(tx: Tx) {
  const d = await workDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  const adminUser: AppUser = {
    id: admin.id,
    companyId: d.companyId,
    role: "admin",
    name: "n",
    email: "admin@co.test",
    phone: null,
    signInPhone: null,
  };
  const session = async (
    worker: string,
    job: string,
    day: string,
    start: string,
    end: string | null,
  ) => {
    await eventIn(tx, d, { worker, job, type: "started", client: at(day, start) });
    if (end !== null) {
      await eventIn(tx, d, { worker, job, type: "ended", client: at(day, end) });
    }
  };
  const read = async () => {
    await asTenant(tx, d.companyId);
    const rows = await listJobsWithHours(tx, adminUser, NOW);
    await tx.execute(sql`reset role`);
    return new Map(rows.map((r) => [r.id, r.hours]));
  };
  return { ...d, admin, session, read };
}

describe("job.list: hours per job", () => {
  it("answers zero for a job nobody has worked on", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const hours = await w.read();
      expect(hours.get(w.J)).toEqual({ week: 0, toDate: 0 });
      expect(hours.get(w.K)).toEqual({ week: 0, toDate: 0 });
    });
  });

  it("sums a job's hours over everyone, this week apart from to date", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      // Last week on J: eight hours, to date only.
      await w.session(w.w1, w.J, "2026-11-12", "07:00", "15:00");
      // This week on J: two people, a Monday and a Tuesday.
      await w.session(w.w1, w.J, "2026-11-16", "07:00", "15:00");
      await w.session(w.w2, w.J, "2026-11-17", "07:00", "11:30");
      // This week on K, by the same person on the same Tuesday.
      await w.session(w.w2, w.K, "2026-11-17", "12:00", "15:00");
      const hours = await w.read();
      expect(hours.get(w.J)).toEqual({ week: 1250, toDate: 2050 });
      expect(hours.get(w.K)).toEqual({ week: 300, toDate: 300 });
    });
  });

  it("holds the week to the company's Monday and Sunday, both included", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await w.session(w.w1, w.J, "2026-11-15", "07:00", "08:00"); // the Sunday before
      await w.session(w.w1, w.J, "2026-11-16", "07:00", "09:00"); // Monday
      await w.session(w.w1, w.J, "2026-11-22", "07:00", "10:00"); // Sunday
      await w.session(w.w1, w.J, "2026-11-23", "07:00", "11:00"); // the Monday after
      expect((await w.read()).get(w.J)).toEqual({ week: 500, toDate: 1000 });
    });
  });

  it("counts nothing of a session still open or voided, as Hours counts nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await w.session(w.w1, w.J, "2026-11-17", "07:00", null);
      const start = await eventIn(tx, w, {
        worker: w.w2,
        job: w.J,
        type: "started",
        client: at("2026-11-16", "07:00"),
      });
      await eventIn(tx, w, {
        worker: w.w2,
        job: w.J,
        type: "ended",
        client: at("2026-11-16", "15:00"),
      });
      await eventIn(tx, w, {
        worker: w.w2,
        job: w.J,
        type: "voided",
        client: at("2026-11-16", "16:00"),
        voids: start,
        initiator: w.admin.id,
      });
      expect((await w.read()).get(w.J)).toEqual({ week: 0, toDate: 0 });
    });
  });

  it("adds up to what labor.hours answers for the same job and week", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      // Awkward seconds, rounded once per person, job and day.
      const odd = (minutes: number) =>
        new Date(
          Date.parse(at("2026-11-16", "07:00")) + minutes * 60_000 + 10_000,
        ).toISOString();
      for (const worker of [w.w1, w.w2]) {
        await eventIn(tx, w, {
          worker,
          job: w.J,
          type: "started",
          client: at("2026-11-16", "07:00"),
        });
        await eventIn(tx, w, { worker, job: w.J, type: "ended", client: odd(20) });
      }
      const listed = (await w.read()).get(w.J)!;
      await asTenant(tx, w.companyId);
      const screen = await appCallerIn(tx, w.admin.who).labor.hours({
        from: "2026-11-16",
        to: "2026-11-22",
        jobId: w.J,
      });
      expect(listed.week).toBe(screen.totals.hundredths);
      // Two cells of 0.34 h: 0.68, never 0.67 from one sum rounded.
      expect(listed.week).toBe(68);
    });
  });
});
