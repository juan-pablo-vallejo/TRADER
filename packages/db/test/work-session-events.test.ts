// Stage 2 line 3: the labor ledger, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts. The mutations are raw SQL on purpose: no Drizzle
// update or delete against this table exists anywhere, tests included.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { companies, customers, jobs, users, workSessionEvents } from "../src/schema";
import { company, one, pgError, rolledBack, sqlstate, type Tx } from "./helpers";

// What the device will do in Stage 5: 48 bits of milliseconds, version 7, variant 10, random.
function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// One company, one worker, one job: the rows an event must reference.
async function fixture(tx: Tx) {
  const c = one(
    await tx.insert(companies).values(company).returning({ id: companies.id }),
  );
  const worker = one(
    await tx
      .insert(users)
      .values({ companyId: c.id, email: "w@co.test", name: "Worker" })
      .returning({ id: users.id }),
  );
  const customer = one(
    await tx
      .insert(customers)
      .values({ companyId: c.id, name: "Customer" })
      .returning({ id: customers.id }),
  );
  const job = one(
    await tx
      .insert(jobs)
      .values({ companyId: c.id, customerId: customer.id, name: "Job" })
      .returning({ id: jobs.id }),
  );
  return { companyId: c.id, workerId: worker.id, jobId: job.id };
}

type Refs = Awaited<ReturnType<typeof fixture>>;

// A complete, legal clock-in as the push handler will write it.
const started = (refs: Refs): typeof workSessionEvents.$inferInsert => ({
  id: uuidv7(),
  ...refs,
  type: "started",
  clientTimestamp: new Date(),
  clockSkewed: false,
  clockSkewMs: 0,
  attestationLevel: "none",
  schemaVersion: 1,
});

const APPEND_ONLY =
  /^work_session_events is append-only: (UPDATE|DELETE|TRUNCATE) rejected$/;

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("work_session_events", () => {
  it("rejects UPDATE and the row survives", async () => {
    await rolledBack(db, async (tx) => {
      const event = started(await fixture(tx));
      await tx.insert(workSessionEvents).values(event);
      const error = await pgError(
        tx.transaction((sp) =>
          sp.execute(sql`update work_session_events set type = 'ended'`),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe("work_session_events is append-only: UPDATE rejected");
      const row = one(await tx.select().from(workSessionEvents));
      expect(row.type).toBe("started");
    });
  });

  it("rejects DELETE and the row survives", async () => {
    await rolledBack(db, async (tx) => {
      await tx.insert(workSessionEvents).values(started(await fixture(tx)));
      const error = await pgError(
        tx.transaction((sp) => sp.execute(sql`delete from work_session_events`)),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe("work_session_events is append-only: DELETE rejected");
      expect(await tx.select().from(workSessionEvents)).toHaveLength(1);
    });
  });

  it("rejects TRUNCATE, which bypasses row triggers", async () => {
    await rolledBack(db, async (tx) => {
      await tx.insert(workSessionEvents).values(started(await fixture(tx)));
      const error = await pgError(
        tx.transaction((sp) => sp.execute(sql`truncate work_session_events`)),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe("work_session_events is append-only: TRUNCATE rejected");
      expect(await tx.select().from(workSessionEvents)).toHaveLength(1);
    });
  });

  it("rejects ON CONFLICT DO UPDATE even when nothing conflicts", async () => {
    // Statement-level UPDATE triggers fire on the clause itself, so the push handler's upsert
    // can only ever be DO NOTHING; the shape is enforced here, not remembered.
    await rolledBack(db, async (tx) => {
      const event = started(await fixture(tx));
      const error = await pgError(
        tx.transaction((sp) =>
          sp
            .insert(workSessionEvents)
            .values(event)
            .onConflictDoUpdate({ target: workSessionEvents.id, set: { type: "ended" } }),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toMatch(APPEND_ONLY);
      expect(await tx.select().from(workSessionEvents)).toHaveLength(0);
    });
  });

  it("records a repeated id once under ON CONFLICT DO NOTHING", async () => {
    await rolledBack(db, async (tx) => {
      const event = started(await fixture(tx));
      await tx.insert(workSessionEvents).values(event);
      await tx
        .insert(workSessionEvents)
        .values({ ...event, type: "ended" })
        .onConflictDoNothing({ target: workSessionEvents.id });
      const row = one(await tx.select().from(workSessionEvents));
      expect(row.id).toBe(event.id);
      expect(row.type).toBe("started");
    });
  });

  it("never defaults an id", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, workerId, jobId } = await fixture(tx);
      // Raw SQL: the Drizzle insert type already refuses to omit the id.
      const code = await sqlstate(
        tx.execute(sql`
          insert into work_session_events
            (company_id, worker_id, job_id, type, client_timestamp, clock_skewed,
             clock_skew_ms, attestation_level, schema_version)
          values (${companyId}, ${workerId}, ${jobId}, 'started', now(), false, 0, 'none', 1)
        `),
      );
      expect(code).toBe("23502");
    });
  });

  it("rejects an id that is not version 7", async () => {
    await rolledBack(db, async (tx) => {
      const event = started(await fixture(tx));
      const code = await sqlstate(
        tx.insert(workSessionEvents).values({ ...event, id: crypto.randomUUID() }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a worker who belongs to another company", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = one(
        await tx.insert(companies).values(company).returning({ id: companies.id }),
      );
      const outsider = one(
        await tx
          .insert(users)
          .values({ companyId: b.id, email: "o@b.test", name: "Outsider" })
          .returning({ id: users.id }),
      );
      const code = await sqlstate(
        tx.insert(workSessionEvents).values({ ...started(a), workerId: outsider.id }),
      );
      expect(code).toBe("23503");
    });
  });

  it("rejects a partial location stamp and an accuracy without a fix", async () => {
    await rolledBack(db, async (tx) => {
      const event = started(await fixture(tx));
      const partial = await sqlstate(
        tx.transaction((sp) =>
          sp.insert(workSessionEvents).values({ ...event, locationLat: 41.8 }),
        ),
      );
      expect(partial).toBe("23514");
      const accuracyOnly = await sqlstate(
        tx.transaction((sp) =>
          sp.insert(workSessionEvents).values({ ...event, locationAccuracyM: 12 }),
        ),
      );
      expect(accuracyOnly).toBe("23514");
    });
  });

  it("rejects schema_version 0", async () => {
    await rolledBack(db, async (tx) => {
      const event = started(await fixture(tx));
      const code = await sqlstate(
        tx.insert(workSessionEvents).values({ ...event, schemaVersion: 0 }),
      );
      expect(code).toBe("23514");
    });
  });

  it("writes an event from a clock 90 days off", async () => {
    // integer would overflow at ±24.8 days (22003); the column is bigint so the event is
    // still written, which is the whole point of the skew flag.
    await rolledBack(db, async (tx) => {
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;
      const event = {
        ...started(await fixture(tx)),
        clockSkewed: true,
        clockSkewMs: ninetyDays,
      };
      await tx.insert(workSessionEvents).values(event);
      const row = one(await tx.select().from(workSessionEvents));
      expect(row.clockSkewMs).toBe(ninetyDays);
      expect(row.clockSkewed).toBe(true);
    });
  });

  it("has no updated_at column", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute(sql`
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'work_session_events'
          and column_name = 'updated_at'
      `);
      expect(rows).toHaveLength(0);
    });
  });
});
