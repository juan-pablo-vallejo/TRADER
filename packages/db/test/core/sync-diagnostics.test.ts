// Stage 4, rejected-record diagnostics (V1-D04): the sync_diagnostics table, asserted against
// the migrated container. Rolled-back transactions throughout; see helpers.ts. Cross-tenant
// visibility is row-level-security.test.ts's; the grant matrix is app-role.test.ts's.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { syncDiagnostics } from "../../src/schema";
import {
  asApp,
  fixture,
  one,
  pgError,
  rolledBack,
  sqlstate,
  uuidv7,
  type Tx,
} from "../helpers";

type Refs = Awaited<ReturnType<typeof fixture>>;

const line = (
  refs: Refs,
  over: Partial<typeof syncDiagnostics.$inferInsert> = {},
): typeof syncDiagnostics.$inferInsert => ({
  companyId: refs.companyId,
  userId: refs.workerId,
  requestId: crypto.randomUUID(),
  recordId: uuidv7(),
  recordKind: "labor_event",
  outcome: "rejected",
  code: "time_in_future",
  ...over,
});

const failed = (tx: Tx, row: typeof syncDiagnostics.$inferInsert) =>
  pgError(tx.transaction((sp: Tx) => sp.insert(syncDiagnostics).values(row)));

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("sync_diagnostics", () => {
  it("holds exactly the minimized columns", async () => {
    await rolledBack(db, async (tx) => {
      const { rows } = await tx.execute<{ column_name: string }>(sql`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'sync_diagnostics'
        order by column_name
      `);
      // A column added here is a decision (ARCHITECTURE, rejected-record diagnostics): never
      // a payload, a location, the record's own time or an error's text.
      expect(rows.map((r) => r.column_name)).toEqual([
        "code",
        "company_id",
        "created_at",
        "id",
        "outcome",
        "record_id",
        "record_kind",
        "request_id",
        "user_id",
      ]);
    });
  });

  it("stamps a line with the database's time and takes a record with no readable id", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const row = one(
        await tx
          .insert(syncDiagnostics)
          .values(
            line(refs, {
              recordId: null,
              recordKind: null,
              outcome: "omitted",
              code: "unreadable_record",
            }),
          )
          .returning(),
      );
      expect(row.recordId).toBeNull();
      const { rows } = await tx.execute<{ same: boolean }>(
        sql`select created_at = now() as same from sync_diagnostics where id = ${row.id}`,
      );
      expect(one(rows).same).toBe(true);
    });
  });

  it("refuses an outcome, a code or a kind outside its form (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      for (const [over, constraint] of [
        [{ outcome: "accepted" }, "sync_diagnostics_outcome"],
        [{ code: "Worker said: it's 5pm" }, "sync_diagnostics_code_format"],
        [{ code: "" }, "sync_diagnostics_code_format"],
        [{ code: "a".repeat(65) }, "sync_diagnostics_code_format"],
        [{ recordKind: "41.8240,-71.4128" }, "sync_diagnostics_record_kind_format"],
        [
          { outcome: "request_failed", code: "bad_request" },
          "sync_diagnostics_request_failed_has_no_record",
        ],
      ] as const) {
        const error = await failed(tx, line(refs, over));
        expect(error.code, constraint).toBe("23514");
        expect(error.message, constraint).toContain(constraint);
      }
    });
  });

  it("refuses a caller who is not a user of the line's company (23503)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      const error = await failed(tx, line(a, { userId: b.workerId }));
      expect(error.code).toBe("23503");
      expect(error.message).toContain("sync_diagnostics_company_id_user_id_fk");
    });
  });

  it("keeps one line per record and code, and any number without a record", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const recordId = uuidv7();
      await tx.insert(syncDiagnostics).values(line(refs, { recordId }));
      // The same refusal of the same record, on a later request.
      const again = await failed(tx, line(refs, { recordId }));
      expect(again.code).toBe("23505");
      expect(again.message).toContain(
        "sync_diagnostics_company_id_record_id_code_unique",
      );
      // The same record refused for another reason is another line.
      await tx
        .insert(syncDiagnostics)
        .values(line(refs, { recordId, code: "not_permitted" }));
      const whole = {
        recordId: null,
        recordKind: null,
        outcome: "request_failed",
        code: "bad_request",
      };
      await tx.insert(syncDiagnostics).values([line(refs, whole), line(refs, whole)]);
      const rows = await tx
        .select({ id: syncDiagnostics.id })
        .from(syncDiagnostics)
        .where(eq(syncDiagnostics.companyId, refs.companyId));
      expect(rows).toHaveLength(4);
    });
  });

  it("lets trader_app insert and delete its tenant's lines, and never edit one (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await asApp(tx, refs.companyId);
      await tx.insert(syncDiagnostics).values(line(refs));
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) =>
            sp.execute(sql`update sync_diagnostics set code = 'accepted'`),
          ),
        ),
      ).toBe("42501");
      const gone = await tx.execute(sql`delete from sync_diagnostics`);
      expect(gone.rowCount).toBe(1);
    });
  });

  it("deletes none of another tenant's lines", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      await tx.insert(syncDiagnostics).values([line(a), line(b)]);
      await asApp(tx, a.companyId);
      const gone = await tx.execute(
        sql`delete from sync_diagnostics where company_id = ${b.companyId}`,
      );
      expect(gone.rowCount).toBe(0);
      expect((await tx.execute(sql`delete from sync_diagnostics`)).rowCount).toBe(1);
      await tx.execute(sql`reset role`);
      const kept = await tx
        .select({ companyId: syncDiagnostics.companyId })
        .from(syncDiagnostics)
        .where(eq(syncDiagnostics.companyId, b.companyId));
      expect(kept).toEqual([{ companyId: b.companyId }]);
    });
  });
});
