// The statement meter (meter.ts) on a real pool: it counts what a call sends, transaction
// control included, keeps concurrent calls apart, and changes nothing about a result.
import { sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { createDb } from "../../src/client";
import { metered } from "../../src/meter";

const db = createDb();
afterAll(async () => {
  await db.$client.end();
});

it("counts each statement, begin and commit included", async () => {
  const { value, statements } = await metered(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
      const r = await tx.execute(sql`select 2 as two`);
      return r.rows;
    }),
  );
  expect(value).toEqual([{ two: 2 }]);
  expect(statements).toBe(4);
});

it("keeps two calls running at once apart", async () => {
  const one = metered(async () => {
    await db.execute(sql`select pg_sleep(0.05)`);
    await db.execute(sql`select 1`);
  });
  const three = metered(async () => {
    await db.execute(sql`select 1`);
    await db.execute(sql`select pg_sleep(0.05)`);
    await db.execute(sql`select 1`);
  });
  expect((await one).statements).toBe(2);
  expect((await three).statements).toBe(3);
});

it("counts nothing outside a metered call", async () => {
  await db.execute(sql`select 1`);
  const { statements } = await metered(async () => 0);
  expect(statements).toBe(0);
});
