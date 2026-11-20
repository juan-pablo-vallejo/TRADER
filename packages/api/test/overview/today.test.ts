// overview.today: the company's today for an admin. Who is listed and who is not, each
// shift and whether somebody clocked in on it, the clock's state and since when, the time
// worked so far, the sessions left open from an earlier day, the jobs named, the gate, and
// the tenant wall. Every test runs in an owner transaction that is always rolled back,
// each read as trader_app.
import { invoiceCounters, jobAssignments, jobs, users } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { crewStatus } from "../../src/contract";
import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { overviewToday } from "../../src/overview/today";
import {
  appCallerIn,
  asTenant,
  boundIn,
  eventIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
  workDayIn,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

// A Monday in New York's winter (UTC-5), and the Sunday before it.
const DAY = "2026-11-16";
const EVE = "2026-11-15";
const at = (wall: string, day = DAY) => `${day}T${wall}:00-05:00`;

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
  const shift = async (
    userId: string,
    jobId: string,
    start: string,
    end: string,
    workDate = DAY,
  ) => {
    const id = uuidv7();
    await tx.insert(jobAssignments).values({
      id,
      companyId: d.companyId,
      userId,
      jobId,
      workDate,
      expectedStart: start,
      expectedEnd: end,
    });
    return id;
  };
  const read = async (wall: string) => {
    await asTenant(tx, d.companyId);
    const answer = await overviewToday(tx, adminUser, new Date(at(wall)));
    await tx.execute(sql`reset role`);
    return answer;
  };
  return { ...d, admin, adminUser, shift, read };
}

const of = (answer: Awaited<ReturnType<typeof overviewToday>>, id: string) =>
  answer.people.find((p) => p.person.id === id);

describe("overview.today", () => {
  it("answers an empty day as empty, with the company's date and zone", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const answer = await w.read("09:00");
      expect(answer).toEqual({
        timezone: "America/New_York",
        today: DAY,
        asOf: new Date(at("09:00")),
        people: [],
        earlier: [],
        jobs: [],
        money: { owed: [], overdue: [], drafts: 0, completeJobsNotInvoiced: 0 },
      });
      // The date is the company's, not UTC's: at 23:30 in New York, UTC is already tomorrow.
      expect((await w.read("23:30")).today).toBe(DAY);
    });
  });

  it("lists a person with a shift today and nobody whose shift is another day", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const first = await w.shift(w.w1, w.J, "07:00", "11:00");
      const second = await w.shift(w.w1, w.K, "12:00", "15:30");
      await w.shift(w.w2, w.J, "07:00", "15:30", EVE);
      const answer = await w.read("06:00");
      expect(answer.people.map((p) => p.person.id)).toEqual([w.w1]);
      expect(of(answer, w.w1)).toEqual({
        person: { id: w.w1, name: "w1", phone: null },
        shifts: [
          { id: first, jobId: w.J, start: "07:00", end: "11:00", clockedIn: false },
          { id: second, jobId: w.K, start: "12:00", end: "15:30", clockedIn: false },
        ],
        clock: { status: "off" },
        workedMs: 0,
        workedJobIds: [],
      });
      expect(answer.jobs.map((j) => j.name)).toEqual(["J", "K"]);
      expect(answer.earlier).toEqual([]);
    });
  });

  it("follows one person through a day: expected, late, working, break, done", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await w.shift(w.w1, w.J, "07:00", "15:30");
      const status = async (wall: string) => {
        const answer = await w.read(wall);
        return crewStatus(of(answer, w.w1)!, wall);
      };
      expect(await status("07:10")).toBe("expected");
      expect(await status("07:15")).toBe("late");

      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "started",
        client: at("07:20"),
      });
      let answer = await w.read("09:20");
      expect(of(answer, w.w1)).toMatchObject({
        clock: {
          status: "working",
          jobId: w.J,
          since: new Date(at("07:20")),
          sinceDay: DAY,
        },
        // Two hours running, none of it closed yet.
        workedMs: 2 * 3_600_000,
        workedJobIds: [w.J],
      });
      // No clock-in locked the shift here (the row was written directly): a session begun
      // on its job today says the same.
      expect(of(answer, w.w1)!.shifts[0]!.clockedIn).toBe(true);
      expect(await status("09:20")).toBe("working");

      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "paused",
        client: at("11:20"),
      });
      answer = await w.read("11:50");
      // A break stops the count where it began.
      expect(of(answer, w.w1)).toMatchObject({
        clock: { status: "paused", since: new Date(at("07:20")) },
        workedMs: 4 * 3_600_000,
      });
      expect(await status("11:50")).toBe("break");

      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "resumed",
        client: at("12:00"),
      });
      answer = await w.read("13:00");
      // Four hours before the break and one after: the forty minutes of break count nowhere.
      expect(of(answer, w.w1)!.workedMs).toBe(5 * 3_600_000);

      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "ended",
        client: at("15:00"),
      });
      answer = await w.read("16:00");
      expect(of(answer, w.w1)).toMatchObject({
        clock: { status: "off" },
        workedMs: 7 * 3_600_000,
      });
      expect(await status("16:00")).toBe("done");
    });
  });

  it("marks a shift clocked in on by its lock, and leaves the other waiting", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const morning = await w.shift(w.w1, w.J, "07:00", "11:00");
      await w.shift(w.w1, w.K, "12:00", "15:30");
      const start = await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "started",
        client: at("07:00"),
      });
      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "ended",
        client: at("11:00"),
      });
      await tx
        .update(jobAssignments)
        .set({ lockedAt: new Date(at("07:00")), lockedByEventId: start })
        .where(eq(jobAssignments.id, morning));
      const answer = await w.read("11:30");
      expect(of(answer, w.w1)!.shifts.map((s) => s.clockedIn)).toEqual([true, false]);
      expect(crewStatus(of(answer, w.w1)!, "11:30")).toBe("expected");
      expect(crewStatus(of(answer, w.w1)!, "12:15")).toBe("late");
    });
  });

  it("lists someone who worked today with no shift, and sums their sessions", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await eventIn(tx, w, {
        worker: w.w2,
        job: w.J,
        type: "started",
        client: at("08:00"),
      });
      await eventIn(tx, w, {
        worker: w.w2,
        job: w.J,
        type: "ended",
        client: at("10:00"),
      });
      await eventIn(tx, w, {
        worker: w.w2,
        job: w.K,
        type: "started",
        client: at("10:30"),
      });
      const answer = await w.read("11:00");
      expect(of(answer, w.w2)).toMatchObject({
        shifts: [],
        clock: { status: "working", jobId: w.K, since: new Date(at("10:30")) },
        workedMs: 2.5 * 3_600_000,
        workedJobIds: [w.J, w.K].sort(),
      });
    });
  });

  it("reads a corrected clock-in in its corrected form, and counts a voided session as nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const start = await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "started",
        client: at("07:00"),
      });
      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "started",
        client: at("08:00"),
        server: at("09:00"),
        corrects: start,
        initiator: w.admin.id,
      });
      let answer = await w.read("10:00");
      expect(of(answer, w.w1)).toMatchObject({
        clock: { status: "working", since: new Date(at("08:00")) },
        workedMs: 2 * 3_600_000,
      });

      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "ended",
        client: at("10:00"),
      });
      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "voided",
        client: at("10:30"),
        voids: start,
        initiator: w.admin.id,
      });
      answer = await w.read("11:00");
      // Voided, the session is nobody's work today: with no shift either, they are not listed.
      expect(of(answer, w.w1)).toBeUndefined();
    });
  });

  it("names a session left open from an earlier day apart, however old", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      // Forgotten three weeks ago: no entry of theirs since.
      await eventIn(tx, w, {
        worker: w.w2,
        job: w.K,
        type: "started",
        client: at("07:00", "2026-10-26"),
      });
      // Left open last night by someone with a shift today.
      await w.shift(w.w1, w.J, "07:00", "15:30");
      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "started",
        client: at("16:00", EVE),
      });
      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "paused",
        client: at("18:00", EVE),
      });
      const answer = await w.read("09:00");
      expect(answer.earlier).toEqual([
        {
          person: { id: w.w2, name: "w2", phone: null },
          jobId: w.K,
          since: new Date(at("07:00", "2026-10-26")),
          sinceDay: "2026-10-26",
          state: "working",
        },
        {
          person: { id: w.w1, name: "w1", phone: null },
          jobId: w.J,
          since: new Date(at("16:00", EVE)),
          sinceDay: EVE,
          state: "paused",
        },
      ]);
      // w2 has nothing today and is listed only there. w1 has a shift: listed, with the
      // clock as it stands and none of last night's time counted as today's.
      expect(answer.people.map((p) => p.person.id)).toEqual([w.w1]);
      expect(of(answer, w.w1)).toMatchObject({
        clock: { status: "paused", sinceDay: EVE },
        workedMs: 0,
        workedJobIds: [],
      });
      expect(answer.jobs.map((j) => j.name)).toEqual(["J", "K"]);
    });
  });

  it("does not list a session that began and ended on an earlier day", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "started",
        client: at("07:00", EVE),
      });
      await eventIn(tx, w, {
        worker: w.w1,
        job: w.J,
        type: "ended",
        client: at("15:00", EVE),
      });
      const answer = await w.read("09:00");
      expect(answer.people).toEqual([]);
      expect(answer.earlier).toEqual([]);
    });
  });

  it("gives Call the contact phone, else the sign-in number, and each job its facts", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await tx
        .update(users)
        .set({ phone: "401-555-0100", signInPhone: "+14015550111" })
        .where(eq(users.id, w.w1));
      await tx
        .update(users)
        .set({ signInPhone: "+14015550122" })
        .where(eq(users.id, w.w2));
      await tx
        .update(jobs)
        .set({
          address: "1 Main St",
          notes: "Side door",
          locationLat: 41.8,
          locationLng: -71.4,
          locationRadiusM: 200,
        })
        .where(eq(jobs.id, w.J));
      await w.shift(w.w1, w.J, "07:00", "15:30");
      await w.shift(w.w2, w.J, "07:00", "15:30");
      const answer = await w.read("06:00");
      expect(answer.people.map((p) => p.person.phone)).toEqual([
        "401-555-0100",
        "+14015550122",
      ]);
      expect(answer.jobs).toEqual([
        {
          id: w.J,
          name: "J",
          address: "1 Main St",
          notes: "Side door",
          location: { lat: 41.8, lng: -71.4, radiusM: 200 },
          status: "open",
          customer: { id: w.customerId, name: "Customer" },
        },
      ]);
    });
  });

  it("says what customers owe, how many drafts wait and which complete jobs have no invoice", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const other = await world(tx);
      for (const c of [w, other]) {
        await tx
          .insert(invoiceCounters)
          .values({ companyId: c.companyId, nextInvoiceNumber: 1 });
      }
      const bill = async (c: typeof w) => {
        await asTenant(tx, c.companyId);
        return appCallerIn(tx, c.admin.who).invoice;
      };
      const invoice = async (
        c: typeof w,
        jobId: string,
        cents: number,
        o: { tax?: number; currency?: string; issue?: boolean } = {},
      ) => {
        const id = uuidv7();
        const office = await bill(c);
        await office.create({ id, jobId, currency: o.currency ?? "USD" });
        await office.save({
          invoiceId: id,
          taxCents: o.tax ?? 0,
          lines: [
            {
              id: uuidv7(),
              description: "Work",
              quantity: "1",
              unit: null,
              unitPriceCents: cents,
            },
          ],
        });
        if (o.issue !== false) await office.issue({ invoiceId: id });
        await tx.execute(sql`reset role`);
        return id;
      };
      const pay = async (c: typeof w, invoiceId: string, amountCents: number) => {
        const id = uuidv7();
        await (
          await bill(c)
        ).recordPayment({
          id,
          invoiceId,
          amountCents,
          paidOn: DAY,
          method: "check",
          note: null,
        });
        await tx.execute(sql`reset role`);
        return id;
      };

      // $1,000.00 and $80.00 tax, $300.00 paid: $780.00 owed.
      const partly = await invoice(w, w.J, 100_000, { tax: 8_000 });
      await pay(w, partly, 30_000);
      // Paid in full: owes nothing, and is not counted.
      const paid = await invoice(w, w.J, 50_000);
      await pay(w, paid, 50_000);
      // A payment reversed no longer counts: the whole $200.00 is owed again.
      const reversed = await invoice(w, w.K, 20_000);
      const mistake = await pay(w, reversed, 20_000);
      await (
        await bill(w)
      ).reversePayment({
        id: uuidv7(),
        paymentId: mistake,
        note: null,
      });
      await tx.execute(sql`reset role`);
      // Void: owes nothing.
      const voided = await invoice(w, w.K, 99_900);
      await (await bill(w)).void({ invoiceId: voided });
      await tx.execute(sql`reset role`);
      // Another currency is its own line, never added in.
      await invoice(w, w.K, 40_000, { currency: "CAD" });
      // Two drafts.
      await invoice(w, w.J, 10_000, { issue: false });
      await invoice(w, w.K, 10_000, { issue: false });
      // The other company's invoice is the other company's.
      await invoice(other, other.J, 777_700);

      // Complete jobs: one with nothing, one with only a voided invoice, one with a draft.
      const job = async (name: string) =>
        (
          await tx
            .insert(jobs)
            .values({
              companyId: w.companyId,
              customerId: w.customerId,
              name,
              status: "complete",
            })
            .returning({ id: jobs.id })
        )[0]!.id;
      await job("Done, never billed");
      const onlyVoid = await job("Done, its invoice voided");
      const withDraft = await job("Done, a draft waiting");
      await (await bill(w)).void({ invoiceId: await invoice(w, onlyVoid, 5_000) });
      await tx.execute(sql`reset role`);
      await invoice(w, withDraft, 5_000, { issue: false });

      expect((await w.read("09:00")).money).toEqual({
        owed: [
          { currency: "CAD", cents: 40_000, invoices: 1 },
          { currency: "USD", cents: 78_000 + 20_000, invoices: 2 },
        ],
        // Issued today on terms of zero days, they are due today: nothing is overdue yet.
        overdue: [],
        drafts: 3,
        completeJobsNotInvoiced: 2,
      });
      expect((await other.read("09:00")).money).toEqual({
        owed: [{ currency: "USD", cents: 777_700, invoices: 1 }],
        overdue: [],
        drafts: 0,
        completeJobsNotInvoiced: 0,
      });
      // The same invoices read a year on, with nothing done to them: what is owed is
      // overdue, by the due date alone.
      await asTenant(tx, w.companyId);
      const later = await overviewToday(
        tx,
        w.adminUser,
        new Date("2027-11-16T09:00:00-05:00"),
      );
      await tx.execute(sql`reset role`);
      expect(later.money.overdue).toEqual(later.money.owed);
      expect(later.money.owed).toEqual([
        { currency: "CAD", cents: 40_000, invoices: 1 },
        { currency: "USD", cents: 78_000 + 20_000, invoices: 2 },
      ]);
    });
  });

  it("is an admin's alone, and never shows another company's day", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await w.shift(w.w1, w.J, "07:00", "15:30");
      const other = await world(tx);
      await other.shift(other.w1, other.J, "07:00", "15:30");

      await asTenant(tx, w.companyId);
      expect(await outcome(appCallerIn(tx, w.who).overview.today())).toBe("FORBIDDEN");
      await tx.execute(sql`reset role`);
      await asTenant(tx, w.companyId);
      expect(await outcome(appCallerIn(tx, null).overview.today())).toBe("UNAUTHORIZED");
      await tx.execute(sql`reset role`);

      const mine = await w.read("09:00");
      expect(mine.people.map((p) => p.person.id)).toEqual([w.w1]);
      expect(mine.jobs.map((j) => j.id)).toEqual([w.J]);
      const theirs = await other.read("09:00");
      expect(theirs.people.map((p) => p.person.id)).toEqual([other.w1]);
    });
  });
});
