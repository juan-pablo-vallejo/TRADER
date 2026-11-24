// The server's pool (server/db.ts, the Schema rule's "Pool" in docs/ARCHITECTURE.md): at
// least twice the calls one request may batch, since each holds a connection and the role
// check takes another; idle clients closed after five seconds, which Vercel's
// attachDatabasePool needs to see to keep a suspended function from holding them.
import { afterAll, expect, it } from "vitest";

import { serverDb } from "../src/server/db";
import { MAX_BATCH_SIZE } from "../src/server/handler";

const env = { ...process.env, DATABASE_POOL_MAX: "4" };
const db = serverDb(env);
afterAll(async () => {
  await db.$client.end();
});

it("holds twice a batch at least, and closes an idle client after five seconds", () => {
  expect(db.$client.options.max).toBe(2 * MAX_BATCH_SIZE);
  expect(db.$client.options.idleTimeoutMillis).toBe(5_000);
  const larger = serverDb({ ...process.env, DATABASE_POOL_MAX: "40" });
  expect(larger.$client.options.max).toBe(40);
  void larger.$client.end();
});
