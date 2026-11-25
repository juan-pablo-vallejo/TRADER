// job.read: the job page's one call. Each of the four steps reached and not reached, the
// people of the job with their hours on it, its invoices, the gate and the tenant wall.
// Every test runs in an owner transaction that is always rolled back.
import { invoiceCounters, invoices, jobAssignments, users } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { readJobPage } from "../../src/jobs/read";
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

// Wednesday 18 November 2026 in New York: the week is Monday the 16th to Sunday the 22nd.
const NOW = new Date("2026-11-18T10:00:00-05:00");
const TODAY = "2026-11-18";
const at = (day: string, wall: string) => `${day}T${wall}:00-05:00`;

async function world(tx: Tx) {
  const d = await workDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  await tx
    .insert(invoiceCounters)
    .values({ companyId: d.companyId, nextInvoiceNumber: 1 });
  const adminUser: AppUser = {
    id: admin.id,
    companyId: d.companyId,
    role: "admin",
    name: "n",
    email: "admin@co.test",
    phone: null,
    signInPhone: null,
  };
  const shift = (userId: string, jobId: string, workDate: string) =>
    tx.insert(jobAssignments).values({
      id: uuidv7(),
      companyId: d.companyId,
      userId,
      jobId,
      workDate,
      expectedStart: "07:00",
      expectedEnd: "15:30",
    });
  const session = async (
    worker: string,
    job: string,
    day: string,
    start: string,
    end: string | null,
  ) => {
    await eventIn(tx, d, { worker, job, type: "started", client: at(day, start) });
    if (end !== null)
      await eventIn(tx, d, { worker, job, type: "ended", client: at(day, end) });
  };
  const bill = async () => {
    await asTenant(tx, d.companyId);
    return appCallerIn(tx, admin.who).invoice;
  };
  const invoice = async (jobId: string, cents: number, issue = true) => {
    const id = uuidv7();
    const office = await bill();
    await office.create({ id, jobId, currency: "USD" });
    await office.update({
      invoiceId: id,
      taxCents: 0,
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
    if (issue) await office.issue({ invoiceId: id });
    await tx.execute(sql`reset role`);
    return id;
  };
  const pay = async (invoiceId: string, amountCents: number) => {
    await (
      await bill()
    ).recordPayment({
      id: uuidv7(),
      invoiceId,
      amountCents,
      paidOn: TODAY,
      method: "check",
      note: null,
    });
    await tx.execute(sql`reset role`);
  };
  const read = async (jobId: string) => {
    await asTenant(tx, d.companyId);
    const answer = await readJobPage(tx, adminUser, { jobId }, NOW);
    await tx.execute(sql`reset role`);
    return answer;
  };
  return { ...d, admin, shift, session, invoice, pay, bill, read };
}

describe("job.read: the four steps", () => {
  it("reaches none of them for a job with nothing on it", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const page = await w.read(w.J);
      expect(page.steps).toEqual({
        scheduled: false,
        hoursRecorded: false,
        invoiced: false,
        paid: false,
      });
      expect(page).toMatchObject({
        job: { id: w.J, name: "J", status: "open" },
        timezone: "America/New_York",
        today: TODAY,
        weekStart: "2026-11-16",
        hours: { week: 0, toDate: 0 },
        people: [],
        invoices: [],
      });
    });
  });

  it("is scheduled by a shift today or later, and not by one that has passed", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await w.shift(w.w1, w.J, "2026-11-17");
      expect((await w.read(w.J)).steps.scheduled).toBe(false);
      await w.shift(w.w1, w.J, TODAY);
      expect((await w.read(w.J)).steps.scheduled).toBe(true);
      // Another job's shift is another job's.
      await w.shift(w.w2, w.K, "2026-12-01");
      expect((await w.read(w.K)).steps.scheduled).toBe(true);
    });
  });

  it("has hours recorded by a session that counts, open or ended, and not by a voided one", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await w.session(w.w1, w.J, "2026-11-17", "07:00", null);
      expect((await w.read(w.J)).steps.hoursRecorded).toBe(true);
      expect((await w.read(w.K)).steps.hoursRecorded).toBe(false);

      const start = await eventIn(tx, w, {
        worker: w.w2,
        job: w.K,
        type: "started",
        client: at("2026-11-16", "07:00"),
      });
      await eventIn(tx, w, {
        worker: w.w2,
        job: w.K,
        type: "ended",
        client: at("2026-11-16", "09:00"),
      });
      expect((await w.read(w.K)).steps.hoursRecorded).toBe(true);
      await eventIn(tx, w, {
        worker: w.w2,
        job: w.K,
        type: "voided",
        client: at("2026-11-16", "10:00"),
        voids: start,
        initiator: w.admin.id,
      });
      expect((await w.read(w.K)).steps.hoursRecorded).toBe(false);
    });
  });

  it("is invoiced by an issued invoice that stands, and paid when nothing is owed on them", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      // A draft is not an invoice yet.
      await w.invoice(w.J, 10_000, false);
      expect((await w.read(w.J)).steps).toMatchObject({ invoiced: false, paid: false });

      const first = await w.invoice(w.J, 50_000);
      expect((await w.read(w.J)).steps).toMatchObject({ invoiced: true, paid: false });
      await w.pay(first, 20_000);
      expect((await w.read(w.J)).steps.paid).toBe(false);
      await w.pay(first, 30_000);
      expect((await w.read(w.J)).steps).toMatchObject({ invoiced: true, paid: true });

      // A second invoice with something owed: not paid any more.
      const second = await w.invoice(w.J, 7_500);
      expect((await w.read(w.J)).steps.paid).toBe(false);
      // Voided, it no longer stands: paid again, by the first alone.
      await (await w.bill()).void({ invoiceId: second });
      await tx.execute(sql`reset role`);
      const page = await w.read(w.J);
      expect(page.steps).toMatchObject({ invoiced: true, paid: true });
      expect(page.invoices.map((i) => i.state).sort()).toEqual([
        "draft",
        "issued",
        "void",
      ]);

      // Only a voided invoice: not invoiced.
      const only = await w.invoice(w.K, 5_000);
      await (await w.bill()).void({ invoiceId: only });
      await tx.execute(sql`reset role`);
      expect((await w.read(w.K)).steps).toMatchObject({ invoiced: false, paid: false });
    });
  });
});

// H5: the page read its job's invoices out of the company's newest 500, drafts first, so
// past that an older job read "not invoiced" and offered Create invoice: billed twice.
describe("job.read: a job's own invoices", () => {
  it("finds every invoice of the job, however many the company has", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await w.invoice(w.J, 50_000);
      // 500 newer drafts on another job, each sorting ahead of an issued invoice.
      await tx.insert(invoices).values(
        Array.from({ length: 500 }, () => ({
          companyId: w.companyId,
          customerId: w.customerId,
          jobId: w.K,
          currency: "USD",
          taxCents: 0,
        })),
      );
      const page = await w.read(w.J);
      expect(page.steps).toMatchObject({ invoiced: true, paid: false });
      expect(page.invoices.map((i) => i.state)).toEqual(["issued"]);
    });
  });

  it("lists the company's newest 500, and says when there are more", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const drafts = (n: number) =>
        tx.insert(invoices).values(
          Array.from({ length: n }, () => ({
            companyId: w.companyId,
            customerId: w.customerId,
            jobId: w.K,
            currency: "USD",
            taxCents: 0,
          })),
        );
      const list = async () => {
        const answer = await (await w.bill()).list();
        await tx.execute(sql`reset role`);
        return { shown: answer.items.length, truncated: answer.truncated };
      };
      await drafts(500);
      expect(await list()).toEqual({ shown: 500, truncated: false });
      await drafts(1);
      expect(await list()).toEqual({ shown: 500, truncated: true });
    });
  });
});

describe("job.read: the people of a job", () => {
  it("lists who is scheduled this week, who is on it now, and who has hours on it", async () => {
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
      // w1: scheduled this week, eight hours last week and four this week, on it now.
      await w.shift(w.w1, w.J, "2026-11-19");
      await w.session(w.w1, w.J, "2026-11-12", "07:00", "15:00");
      await w.session(w.w1, w.J, "2026-11-16", "07:00", "11:00");
      await w.session(w.w1, w.J, TODAY, "07:00", null);
      // w2: no shift, two hours on J to date, and time on K that is not this job's.
      await w.session(w.w2, w.J, "2026-11-10", "07:00", "09:00");
      await w.session(w.w2, w.K, "2026-11-17", "07:00", "15:00");
      // The admin: a shift next week only, so not one of this week's people.
      await w.shift(w.admin.id, w.J, "2026-11-24");

      const page = await w.read(w.J);
      expect(page.people).toEqual([
        {
          person: { id: w.w1, name: "w1", phone: "401-555-0100" },
          scheduledThisWeek: true,
          onItNow: true,
          hours: { week: 400, toDate: 1200 },
        },
        {
          person: { id: w.w2, name: "w2", phone: "+14015550122" },
          scheduledThisWeek: false,
          onItNow: false,
          hours: { week: 0, toDate: 200 },
        },
      ]);
      // The job's hours are its people's, added.
      expect(page.hours).toEqual({ week: 400, toDate: 1400 });
      expect(page.steps.scheduled).toBe(true);
    });
  });
});

describe("job.read: who may", () => {
  it("is an admin's alone, and answers FORBIDDEN for a missing or another company's job", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      const other = await world(tx);
      await asTenant(tx, w.companyId);
      expect(await outcome(appCallerIn(tx, w.who).job.read({ jobId: w.J }))).toBe(
        "FORBIDDEN",
      );
      expect(await outcome(appCallerIn(tx, null).job.read({ jobId: w.J }))).toBe(
        "UNAUTHORIZED",
      );
      const office = appCallerIn(tx, w.admin.who).job;
      expect(await outcome(office.read({ jobId: other.J }))).toBe("FORBIDDEN");
      expect(await outcome(office.read({ jobId: uuidv7() }))).toBe("FORBIDDEN");
      expect((await office.read({ jobId: w.J })).job.id).toBe(w.J);
    });
  });
});
