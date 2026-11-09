// TASKS:48, partial failure: full atomicity across procedures is impossible without bypassing
// one-transaction-per-call, so the demo database is the unit of atomicity. A failure before
// anything commits leaves no database; a failure after N committed steps leaves exactly those
// steps' rows, a plain re-run refuses, and `--reset` recovers.
import { createDb, seed } from "@trader/db";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { DemoFailure, runDemo, type Step } from "../src/demo/run";
import { prepareTarget, type Target } from "../src/demo/target";
import { counts, MIGRATIONS, uniqueDemoName } from "./demo-helpers";

const ANCHOR = "2026-10-19";
const admin = createDb();
afterAll(async () => {
  await admin.$client.end();
});

const exists = async (name: string) => {
  const { rows } = await admin.execute<{ n: number }>(
    sql`select count(*)::int as n from pg_database where datname = ${name}`,
  );
  return rows[0]!.n === 1;
};

// What run-demo.ts does around runDemo: drop when nothing committed, keep otherwise.
async function attempt(target: Target, failAt: (step: Step) => void) {
  let committed = 0;
  try {
    await runDemo({
      app: target.app,
      bootstrap: (company) =>
        target.owner.transaction((tx) => seed(tx, company)).then(() => undefined),
      anchor: ANCHOR,
      onStep: (step) => (committed = step.index),
      failAt,
    });
    throw new Error("expected the run to fail");
  } catch (error) {
    if (committed === 0) await target.drop();
    else await target.close();
    return { committed, error: error as Error };
  }
}

describe("demo failure recovery", () => {
  it("leaves no database when the bootstrap fails", async () => {
    const name = uniqueDemoName();
    const target = await prepareTarget({
      env: process.env,
      name,
      reset: false,
      migrationsFolder: MIGRATIONS,
    });
    expect(await exists(name)).toBe(true);
    const { committed, error } = await attempt(target, (step) => {
      if (step.index === 1) throw new Error("bootstrap unavailable");
    });
    expect(committed).toBe(0);
    expect(error.message).toBe("bootstrap unavailable");
    expect(await exists(name)).toBe(false);
  }, 60_000);

  it("keeps the committed steps after a later failure, refuses a re-run, and recovers under reset", async () => {
    const name = uniqueDemoName();
    const target = await prepareTarget({
      env: process.env,
      name,
      reset: false,
      migrationsFolder: MIGRATIONS,
    });
    const { committed, error } = await attempt(target, (step) => {
      if (step.name.startsWith("add jobs")) throw new DemoFailure(step, "injected");
    });
    expect(committed).toBe(5);
    expect(error.message).toMatch(/^step 6 \(add jobs/);
    expect(await exists(name)).toBe(true);
    const owner = createDb({ ...process.env, POSTGRES_DB: name, DATABASE_URL: "" });
    try {
      expect(await counts(owner)).toMatchObject({
        users: 9,
        customers: 4,
        crews: 2,
        crewMembers: 7,
        payRates: 5,
        jobs: 0,
        events: 0,
      });
    } finally {
      await owner.$client.end();
    }

    await expect(
      prepareTarget({
        env: process.env,
        name,
        reset: false,
        migrationsFolder: MIGRATIONS,
      }),
    ).rejects.toThrow(/already exists/);
    expect(await exists(name)).toBe(true);

    const fresh = await prepareTarget({
      env: process.env,
      name,
      reset: true,
      migrationsFolder: MIGRATIONS,
    });
    try {
      expect(await counts(fresh.owner)).toMatchObject({ users: 0, customers: 0 });
    } finally {
      await fresh.drop();
    }
    expect(await exists(name)).toBe(false);
  }, 60_000);
});
