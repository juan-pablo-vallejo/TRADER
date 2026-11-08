// TASKS:48: a complete demo run into a database of its own, at a pinned anchor. The owner wrote
// the bootstrap only; every other row came through a procedure under trader_app; every persona
// who called is bound to the development subject; what the office screens will read is there.
import { seed } from "@trader/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext } from "../src/context";
import { DEMO, EXPECTED, PEOPLE, SCENARIOS } from "../src/demo/content";
import { runDemo, type Step, type Summary } from "../src/demo/run";
import { prepareTarget, type Target } from "../src/demo/target";
import { appRouter } from "../src/router";
import { createCallerFactory } from "../src/trpc";
import { counts, MIGRATIONS, spyOnQueries, uniqueDemoName } from "./demo-helpers";
import { quietReporter } from "./helpers";

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
      "after_closeout",
      "corrected",
    ]) {
      expect(reasons.has(r as never)).toBe(true);
    }
    expect(reasons.has("clock_skewed" as never)).toBe(false);
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
