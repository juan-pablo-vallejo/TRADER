import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: "../../.env" });

/**
 * Invariants that must hold in the *database*, not merely in application code.
 *
 * Requires local Postgres: `pnpm db:up && pnpm db:migrate`.
 */
const pool = new Pool({
  connectionString:
    process.env.LOCAL_DATABASE_URL ?? "postgresql://trader:trader@localhost:5432/trader",
});

// Fixed hex UUIDs so reruns are idempotent and rows are recognisable in psql.
const COMPANY = "00000000-0000-7000-8000-0000000000c1";
const USER = "00000000-0000-7000-8000-0000000000b1";
const CUSTOMER = "00000000-0000-7000-8000-0000000000c2";
const JOB = "00000000-0000-7000-8000-0000000000d1";
const EVENT = "00000000-0000-7000-8000-0000000000e1";

beforeAll(async () => {
  await pool.query(
    `INSERT INTO companies (id,name,timezone) VALUES ($1,'Invariant Co','America/New_York')
     ON CONFLICT DO NOTHING`,
    [COMPANY],
  );
  await pool.query(
    `INSERT INTO users (id,company_id,clerk_user_id,role,name)
     VALUES ($1,$2,'clerk_invariant','worker','Invariant Worker') ON CONFLICT DO NOTHING`,
    [USER, COMPANY],
  );
  await pool.query(
    `INSERT INTO customers (id,company_id,name) VALUES ($1,$2,'Invariant Cust')
     ON CONFLICT DO NOTHING`,
    [CUSTOMER, COMPANY],
  );
  await pool.query(
    `INSERT INTO jobs (id,company_id,customer_id,status) VALUES ($1,$2,$3,'active')
     ON CONFLICT DO NOTHING`,
    [JOB, COMPANY, CUSTOMER],
  );
  await pool.query(
    `INSERT INTO work_session_events
       (id,company_id,worker_id,job_id,type,client_timestamp,initiator_user_id)
     VALUES ($1,$2,$3,$4,'started',now(),$3) ON CONFLICT DO NOTHING`,
    [EVENT, COMPANY, USER, JOB],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("work_session_events is append-only", () => {
  // SPEC §5: no role, including admin, may mutate a submitted labor record.
  // The app owns these tables, so REVOKE cannot bind it — only a trigger can.

  it("rejects UPDATE", async () => {
    await expect(
      pool.query(`UPDATE work_session_events SET type='ended' WHERE id=$1`, [EVENT]),
    ).rejects.toThrow(/append-only violation/i);
  });

  it("rejects DELETE", async () => {
    await expect(
      pool.query(`DELETE FROM work_session_events WHERE id=$1`, [EVENT]),
    ).rejects.toThrow(/append-only violation/i);
  });

  it("rejects TRUNCATE", async () => {
    // TRUNCATE bypasses UPDATE/DELETE triggers entirely and needs its own guard.
    await expect(pool.query(`TRUNCATE work_session_events`)).rejects.toThrow(
      /append-only violation/i,
    );
  });

  it("still permits INSERT, and the original row survives", async () => {
    const id = "00000000-0000-7000-8000-0000000000e2";
    await pool.query(
      `INSERT INTO work_session_events
         (id,company_id,worker_id,job_id,type,client_timestamp,initiator_user_id)
       VALUES ($1,$2,$3,$4,'ended',now(),$3) ON CONFLICT DO NOTHING`,
      [id, COMPANY, USER, JOB],
    );
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM work_session_events WHERE id=$1`,
      [EVENT],
    );
    expect(rows[0]?.n).toBe("1");
  });
});

describe("money columns", () => {
  it("are integer-family, never floating point", async () => {
    // SPEC §4: integer minor units, never floats. A float here silently loses
    // cents under arithmetic, which is unrecoverable in payroll and billing.
    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema='public' AND column_name LIKE '%\\_cents'`,
    );

    expect(rows.length).toBeGreaterThan(0);
    const offenders = rows.filter(
      (r) => !["bigint", "integer", "smallint"].includes(r.data_type),
    );
    expect(offenders, `non-integer money columns: ${JSON.stringify(offenders)}`).toEqual(
      [],
    );
  });
});

describe("multi-tenancy seam", () => {
  it("every tenant-scoped table carries a non-nullable company_id", async () => {
    // SPEC §4: company_id is the seam RLS attaches to when tenant #2 onboards.
    // A nullable one anywhere would force a backfill at exactly the wrong moment.
    const tenantScoped = [
      "users",
      "crews",
      "crew_members",
      "customers",
      "jobs",
      "work_session_events",
      "materials",
      "invoices",
      "invoice_line_items",
      "audit_log",
    ];

    const { rows } = await pool.query<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema='public' AND column_name='company_id'`,
    );

    const found = new Map(rows.map((r) => [r.table_name, r.is_nullable]));
    for (const t of tenantScoped) {
      expect(found.get(t), `${t} is missing company_id`).toBeDefined();
      expect(found.get(t), `${t}.company_id is nullable`).toBe("NO");
    }
  });
});

describe("clock-in is never blocked by location", () => {
  it("device location columns are nullable", async () => {
    // SPEC §3: a foreman in a basement with no signal must be able to clock in —
    // and GPS is typically unavailable in exactly that basement. Location is
    // best-effort. Making any of these NOT NULL would strand a worker underground.
    const { rows } = await pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='work_session_events'
          AND column_name LIKE 'device\\_%'`,
    );

    expect(rows.length, "device location columns are missing").toBe(3);
    for (const r of rows) {
      expect(r.is_nullable, `${r.column_name} must stay nullable`).toBe("YES");
    }
  });

  /**
   * The sync pull cursor pages on `(server_timestamp, id)` and is carried by
   * clients as a JavaScript `Date`, which holds milliseconds and nothing finer.
   * At Postgres's default microsecond precision the driver truncates on the way
   * out, so a cursor lands fractionally behind the row it came from, every
   * `server_timestamp > cursor` stays true for rows already delivered, and
   * pagination never advances — sync livelocks while looking healthy.
   *
   * Caught by three cursor tests hanging on their iteration bound. Pinned here
   * because it is a property of the column, and nothing in application code
   * would fail if a later migration widened it back.
   */
  it("stores server_timestamp at millisecond precision, so a JS cursor can match it", async () => {
    const { rows } = await pool.query<{ datetime_precision: number }>(
      `SELECT datetime_precision
         FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='work_session_events'
          AND column_name='server_timestamp'`,
    );
    expect(rows[0]?.datetime_precision).toBe(3);
  });

  it("writes no sub-millisecond component a JS Date would silently drop", async () => {
    const id = "00000000-0000-7000-8000-0000000000e4";
    await pool.query(
      `INSERT INTO work_session_events
         (id,company_id,worker_id,job_id,type,client_timestamp,initiator_user_id)
       VALUES ($1,$2,$3,$4,'started',now(),$3) ON CONFLICT DO NOTHING`,
      [id, COMPANY, USER, JOB],
    );
    const { rows } = await pool.query<{ micros: string }>(
      `SELECT (extract(microseconds from server_timestamp)::bigint % 1000)::text AS micros
         FROM work_session_events WHERE id=$1`,
      [id],
    );
    expect(rows[0]?.micros).toBe("0");
  });

  it("accepts an event with no location at all", async () => {
    const id = "00000000-0000-7000-8000-0000000000e3";
    await pool.query(
      `INSERT INTO work_session_events
         (id,company_id,worker_id,job_id,type,client_timestamp,initiator_user_id)
       VALUES ($1,$2,$3,$4,'started',now(),$3) ON CONFLICT DO NOTHING`,
      [id, COMPANY, USER, JOB],
    );
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM work_session_events
        WHERE id=$1 AND device_lat IS NULL`,
      [id],
    );
    expect(rows[0]?.n).toBe("1");
  });
});
