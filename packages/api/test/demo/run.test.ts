// TASKS:48: a complete demo run into a database of its own, at a pinned anchor. The owner wrote
// the bootstrap only; every other row came through a procedure under trader_app; every persona
// who called is bound to the development subject; what the office screens will read is there.
import { seed } from "@trader/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext } from "../../src/core/context";
import {
  COSTS,
  DEMO,
  EXPECTED,
  EXPECTED_AUDIT,
  PEOPLE,
  RECEIPTS,
  SCENARIOS,
  workDays,
} from "../../src/demo/content";
import { runDemo, type Step, type Summary } from "../../src/demo/run";
import { prepareTarget, type Target } from "../../src/demo/target";
import { appRouter } from "../../src/router";
import { createCallerFactory } from "../../src/core/trpc";
import { auditCounts, counts, MIGRATIONS, spyOnQueries, uniqueDemoName } from "./helpers";
import { quietReporter, REQUEST_ID } from "../helpers";

const ANCHOR = "2026-10-19";

let target: Target;
let summary: Summary;
const steps: Step[] = [];
const ownerStatements: string[] = [];

beforeAll(async () => {
  target = await prepareTarget({
    env: process.env,
    name: uniqueDemoName(),
    reset: false,
    migrationsFolder: MIGRATIONS,
  });
  // Every statement the owner pool sends during the run is recorded: the migrator is done, and
  // the tests' own reads afterwards are not the run's.
  let recording = true;
  spyOnQueries(target.owner, (text) => {
    if (recording) ownerStatements.push(text.replace(/\s+/g, " ").trim());
  });
  summary = await runDemo({
    app: target.app,
    bootstrap: (company) =>
      target.owner.transaction((tx) => seed(tx, company)).then(() => undefined),
    anchor: ANCHOR,
    onStep: (step) => steps.push(step),
  });
  recording = false;
}, 120_000);

afterAll(async () => {
  await target.drop();
});

const admin = () =>
  createCallerFactory(appRouter)(
    createContext({
      db: target.app,
      identity: {
        subject: `dev:${DEMO.adminEmail}`,
        email: DEMO.adminEmail,
        emailVerified: true,
      },
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  );

describe("the demo run", () => {
  it("writes exactly the planned company, and the database agrees", async () => {
    const { steps: n, ...wrote } = summary;
    expect(wrote).toEqual(EXPECTED);
    expect(n).toBe(steps.length);
    expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i + 1));
    expect(await counts(target.owner)).toEqual(EXPECTED);
  });

  it("left an audit row for each audited write, and for nothing else it did", async () => {
    // The run goes through crews, customers, jobs, pushes, closeouts, corrections and
    // sign-ins as well: any of them writing a row would add to a count or add an action.
    const performed = Object.fromEntries(
      Object.entries(EXPECTED_AUDIT).filter(([, n]) => n > 0),
    );
    expect(await auditCounts(target.owner)).toEqual(performed);
    // Every row's actor is the demo admin: the one caller of the audited procedures.
    const { rows } = await target.owner.execute<{ email: string }>(sql`
      select distinct u.email from audit_log a join users u on u.id = a.actor_user_id
    `);
    expect(rows).toEqual([{ email: DEMO.adminEmail }]);
  });

  it("let the owner write the bootstrap and nothing else", () => {
    const body = ownerStatements
      .map((s) => s.toLowerCase())
      .filter((s) => s !== "begin" && s !== "commit");
    expect(body).toHaveLength(5);
    expect(body[0]).toMatch(/^select rolname as me/);
    expect(body[1]).toMatch(/^insert into companies/);
    expect(body[2]).toMatch(/^insert into invoice_counters/);
    expect(body[3]).toMatch(/^insert into users/);
    expect(body[4]).toMatch(/^select \(select count/);
    expect(ownerStatements.filter((s) => /^(update|delete)/i.test(s))).toEqual([]);
  });

  it("ran every procedure as trader_app and bound every caller to the development subject", async () => {
    const role = await target.app.execute<{ who: string }>(
      sql`select current_user as who`,
    );
    expect(role.rows[0]!.who).toBe("trader_app");
    const { rows } = await target.owner.execute<{
      email: string;
      subject: string | null;
    }>(sql`select email, identity_subject as subject from users order by email`);
    const bound = new Map(rows.map((r) => [r.email, r.subject]));
    expect(bound.get(DEMO.adminEmail)).toBe(`dev:${DEMO.adminEmail}`);
    for (const p of PEOPLE) {
      expect(bound.get(p.email)).toBe(p.crew === null ? null : `dev:${p.email}`);
    }
  });

  // The run holds J1 and two days of hours to the plan itself (its last step). J2, worked out
  // here: Omar's nine approved days at 2700 (9 × 21600), his user-timed last day waiting;
  // Marcus and Elena have no rate, so his ten days and her nine are unrated, and her last,
  // 8.50 h with the office's correction, waits unrated. Receipts: the amended one is priced
  // and counts while its amend waits; the primer is unpriced; the late one waits, unpriced.
  it("reads the other crew's job cost as the plan works it out", async () => {
    const jobs = await admin().job.list();
    const j2 = jobs.find((j) => j.name === "Harbor View unit 4B")!;
    const { labor, materials, total, job } = await admin().job.cost({ jobId: j2.id });
    const { lines, ...figures } = labor;
    expect(job.name).toBe("Harbor View unit 4B");
    expect(lines).toHaveLength(9 + 10 + 9);
    expect(figures).toEqual({
      approvedHundredths: 28 * 800,
      totals: [{ currency: "USD", cents: 9 * 21600 }],
      unrated: { hundredths: 19 * 800, lines: 19 },
      pending: {
        hundredths: 800 + 850,
        sessions: 2,
        totals: [{ currency: "USD", cents: 21600 }],
        unratedHundredths: 850,
      },
      rejectedSessions: 0,
      openSessions: 0,
    });
    expect(materials).toEqual({
      totals: [{ currency: "USD", cents: 17196 }],
      receipts: 1,
      unpriced: 1,
      pending: { totals: [], receipts: 1, unpriced: 1 },
      rejected: 0,
      voided: 0,
    });
    expect(total).toEqual([{ currency: "USD", cents: 9 * 21600 + 17196 }]);
    // A job nobody worked costs nothing.
    const j3 = jobs.find((j) => j.name === "Greenfield hallway repaint")!;
    expect((await admin().job.cost({ jobId: j3.id })).total).toEqual([]);
  });

  it("shows the office what the plan says", async () => {
    const roster = await admin().roster.list();
    expect(roster).toHaveLength(EXPECTED.users);
    const byEmail = new Map(roster.map((u) => [u.email, u]));
    expect(byEmail.get("priya.shah@demo.invalid")!.deactivatedAt).not.toBeNull();
    expect(byEmail.get("marcus.bell@demo.invalid")!.role).toBe("worker");
    expect(byEmail.get("sam.carter@demo.invalid")!.invited).toBe(true);
    expect(byEmail.get("ana.ruiz@demo.invalid")!.currentRate?.hourlyRateCents).toBe(3000);

    const crews = await admin().crew.list();
    expect(
      crews.map((c) => [c.name, c.foreman.available, c.members.length]).sort(),
    ).toEqual([
      ["Crew A — Herrera", true, 4],
      ["Crew B — Bell", false, 3],
    ]);

    const customers = await admin().customer.list();
    expect(
      customers.find((c) => c.name === "Old Mill Offices")!.deactivatedAt,
    ).not.toBeNull();
    expect(customers.filter((c) => c.deactivatedAt === null)).toHaveLength(3);

    const jobs = await admin().job.list();
    expect(jobs.map((j) => j.status).sort()).toEqual([
      "archived",
      "complete",
      "complete",
      "open",
      "open",
      "open",
    ]);
    expect(jobs.filter((j) => j.crew === null)).toHaveLength(2);

    const queue = await admin().approval.queue({ limit: 100 });
    expect(queue.items).toHaveLength(EXPECTED.approvals - EXPECTED.decided);
    const reasons = new Set(queue.items.flatMap((i) => i.reasons));
    for (const r of [
      "offline",
      "user_timed",
      "location",
      "clock_skewed",
      "after_closeout",
      "corrected",
    ]) {
      expect(reasons.has(r as never)).toBe(true);
    }
  });

  it("shows the office its receipts: three it priced, one it entered, the rest to price", async () => {
    const all = await admin().material.list({ show: "all" });
    expect(all.items).toHaveLength(EXPECTED.materials);
    expect(
      all.items
        .filter((m) => m.cost !== null)
        .map((m) => [m.original.description, m.cost])
        .sort(),
    ).toEqual(
      [
        ...COSTS.map((c) => [
          RECEIPTS[c.receipt].description,
          { cents: c.cents, currency: c.currency },
        ]),
        [SCENARIOS.officeReceipt.description, SCENARIOS.officeReceipt.cost],
      ].sort(),
    );
    // One receipt is the office's own, by the admin, waiting for an admin who is not them.
    expect(
      all.items
        .filter((m) => m.enteredByOffice)
        .map((m) => [m.original.description, m.loggedBy.name, m.accounting]),
    ).toEqual([[SCENARIOS.officeReceipt.description, DEMO.adminName, "pending"]]);
    const unpriced = await admin().material.list({});
    expect(unpriced.items).toHaveLength(EXPECTED.materials - EXPECTED.pricedMaterials);
    expect(unpriced.items.every((m) => m.cost === null)).toBe(true);
    // The late receipt waits for the office; pricing it does not depend on that.
    expect(unpriced.items.map((m) => m.accounting).sort()).toEqual([
      "eligible",
      "eligible",
      "pending",
    ]);
  });

  it("shows the office the corrected day through the worker's ledger", async () => {
    const s = SCENARIOS.repairedEnd;
    const elena = (await admin().roster.list()).find(
      (u) => u.email === PEOPLE.find((p) => p.key === s.who)!.email,
    )!;
    const day = workDays(ANCHOR)[s.day]!;
    const ledger = await admin().labor.ledger({
      workerId: elena.id,
      from: day,
      to: day,
    });
    expect(ledger.openSession).toBeNull();
    const session = ledger.sessions.at(-1)!;
    expect(session).toMatchObject({
      workDate: day,
      complete: true,
      corrected: true,
      // The last recorded day: the one day of the ten with no closeout.
      closedOut: false,
      accounting: "pending",
    });
    // The clock-out as the phone recorded it stays beside the office's correction of it.
    const ends = session.events.filter((e) => e.type === "ended");
    expect(ends.map((e) => e.effect)).toEqual(["superseded", "in_effect"]);
    const [original, correction] = ends;
    expect(correction).toMatchObject({
      correctsEventId: original!.id,
      initiator: { name: DEMO.adminName },
      approval: { decision: "pending", reasons: s.reasons },
    });
    expect(session.endedAt).toEqual(correction!.clientTimestamp);
    // What the admin approved in the backlog reads as decided, by name.
    expect(original!.approval).toMatchObject({
      decision: "approved",
      decidedBy: { name: DEMO.adminName },
    });
  });

  it("refuses an owner pool as the application pool before writing anything", async () => {
    const before = await counts(target.owner);
    await expect(
      runDemo({
        app: target.owner,
        bootstrap: () => Promise.resolve(),
        anchor: ANCHOR,
      }),
    ).rejects.toThrow(/superuser|bypasses row-level security/);
    expect(await counts(target.owner)).toEqual(before);
  });

  it("names its scenarios' people", () => {
    expect(PEOPLE.map((p) => p.key)).toContain(SCENARIOS.deactivatedWorker);
    expect(PEOPLE.map((p) => p.key)).toContain(SCENARIOS.demotedForeman);
  });
});
