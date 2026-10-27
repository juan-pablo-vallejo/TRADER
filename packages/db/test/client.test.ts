import { sql } from "drizzle-orm";
import { expect, it } from "vitest";

import { createDb } from "../src/client";

it("selects 1 through the pg driver", async () => {
  const db = createDb();
  try {
    const result = await db.execute(sql`select 1 as one`);
    expect(result.rows).toEqual([{ one: 1 }]);
  } finally {
    await db.$client.end();
  }
});
