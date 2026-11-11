import { sql } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { CONNECTION_TIMEOUT_MS, createDb, describePoolError } from "../../src/client";

it("selects 1 through the pg driver", async () => {
  const db = createDb();
  try {
    const result = await db.execute(sql`select 1 as one`);
    expect(result.rows).toEqual([{ one: 1 }]);
  } finally {
    await db.$client.end();
  }
});

it("bounds the wait for a connection and survives an idle client's failure", async () => {
  const db = createDb({ ...process.env, DATABASE_POOL_MAX: "2" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(db.$client.options.max).toBe(2);
    expect(db.$client.options.connectionTimeoutMillis).toBe(CONNECTION_TIMEOUT_MS);
    // Without a listener, EventEmitter throws on `error`: the process would exit.
    const failure = Object.assign(new Error("select secret from t where p = 'x'"), {
      code: "57P01",
    });
    expect(() => db.$client.emit("error", failure)).not.toThrow();
    expect(log).toHaveBeenCalledWith("database pool: idle client failed (Error 57P01)");
  } finally {
    log.mockRestore();
    await db.$client.end();
  }
});

it("describes a pool failure by class and SQLSTATE, never by message", () => {
  expect(describePoolError(new TypeError("secret"))).toBe(
    "database pool: idle client failed (TypeError)",
  );
  expect(describePoolError("secret")).toBe("database pool: idle client failed (unknown)");
});
