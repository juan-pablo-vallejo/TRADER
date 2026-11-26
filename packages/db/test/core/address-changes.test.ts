// The record of the office changing a person's sign-in address: the address_changes table,
// asserted against the migrated container, and with it the two things the change rests on:
// the tenant path may write a person's email and sign-in number, and a sign-in identity may
// not (identity-binding.test.ts has that side). Rolled-back transactions throughout; see
// helpers.ts. The catalog side — FORCE, the policy, the grant matrix — is
// row-level-security.test.ts's and app-role.test.ts's.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { addressChanges, users } from "../../src/schema";
import {
  asApp,
  billing,
  type Billing,
  pgError,
  rolledBack,
  sqlstate,
  type Tx,
} from "../helpers";

type Row = typeof addressChanges.$inferInsert;

const change = (refs: Billing, over: Partial<Row> = {}): Row => ({
  companyId: refs.companyId,
  userId: refs.workerId,
  field: "email",
  oldValue: null,
  newValue: "worker@crew.test",
  changedByUserId: refs.adminId,
  ...over,
});

async function refused(tx: Tx, row: Row) {
  const error = (await pgError(
    tx.transaction((sp: Tx) => sp.insert(addressChanges).values(row)),
  )) as { code?: string; constraint?: string };
  return { code: error.code, constraint: error.constraint };
}

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("address_changes", () => {
  it("records an address given, changed and taken away, of either kind", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      await tx.insert(addressChanges).values(change(refs));
      await tx
        .insert(addressChanges)
        .values(change(refs, { oldValue: "worker@crew.test", newValue: "w@crew.test" }));
      await tx
        .insert(addressChanges)
        .values(change(refs, { oldValue: "w@crew.test", newValue: null }));
      await tx.insert(addressChanges).values(
        change(refs, {
          field: "sign_in_phone",
          oldValue: "+14015550123",
          newValue: "+14015550124",
        }),
      );
      const rows = await tx.select().from(addressChanges);
      expect(rows).toHaveLength(4);
      // Each has an id and a time of its own, the database's.
      expect(new Set(rows.map((row) => row.id)).size).toBe(4);
      for (const row of rows) expect(row.createdAt).toBeInstanceOf(Date);
    });
  });

  it("refuses a field it does not know, a change that changes nothing, and one's own", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      for (const [row, constraint] of [
        [change(refs, { field: "phone" }), "address_changes_field"],
        [change(refs, { field: "name" }), "address_changes_field"],
        [
          change(refs, { oldValue: "same@crew.test", newValue: "same@crew.test" }),
          "address_changes_changed",
        ],
        [change(refs, { oldValue: null, newValue: null }), "address_changes_changed"],
        // Nobody changes their own addresses: neither replaces an email nor touches a number.
        [
          change(refs, { userId: refs.adminId, oldValue: "old@crew.test" }),
          "address_changes_not_own",
        ],
        [
          change(refs, {
            userId: refs.adminId,
            field: "sign_in_phone",
            newValue: "+14015550100",
          }),
          "address_changes_not_own",
        ],
      ] as const) {
        expect([constraint, await refused(tx, row)]).toEqual([
          constraint,
          { code: "23514", constraint },
        ]);
      }
    });
  });

  it("records an email a person added to their own login that had none", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      await tx
        .insert(addressChanges)
        .values(change(refs, { changedByUserId: refs.workerId }));
      const rows = await tx
        .select({ by: addressChanges.changedByUserId })
        .from(addressChanges)
        .where(eq(addressChanges.userId, refs.workerId));
      expect(rows).toEqual([{ by: refs.workerId }]);
    });
  });

  it("refuses another company's person and another company's admin", async () => {
    await rolledBack(db, async (tx) => {
      const a = await billing(tx);
      const b = await billing(tx, { name: "Other Co", timezone: "America/New_York" });
      expect(await refused(tx, change(a, { userId: b.workerId }))).toEqual({
        code: "23503",
        constraint: "address_changes_company_id_user_id_fk",
      });
      expect(await refused(tx, change(a, { changedByUserId: b.adminId }))).toEqual({
        code: "23503",
        constraint: "address_changes_company_id_changed_by_user_id_fk",
      });
    });
  });

  it("is written once: no update, no delete, no truncate, the owner included", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const [row] = await tx
        .insert(addressChanges)
        .values(change(refs))
        .returning({ id: addressChanges.id });
      for (const statement of [
        sql`update address_changes set new_value = 'x@crew.test' where id = ${row!.id}`,
        sql`delete from address_changes where id = ${row!.id}`,
        sql`truncate address_changes`,
      ]) {
        expect(await sqlstate(tx.transaction((sp: Tx) => sp.execute(statement)))).toBe(
          "23000",
        );
      }
      expect(await tx.select().from(addressChanges)).toHaveLength(1);
    });
  });

  it("lets the application add and read its own company's, and no other's", async () => {
    await rolledBack(db, async (tx) => {
      const a = await billing(tx);
      const b = await billing(tx, { name: "Other Co", timezone: "America/New_York" });
      await tx.insert(addressChanges).values(change(b));
      await asApp(tx, a.companyId);
      await tx.insert(addressChanges).values(change(a));
      expect(await tx.select().from(addressChanges)).toHaveLength(1);
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) => sp.insert(addressChanges).values(change(b))),
        ),
      ).toBe("42501");
    });
  });
});

describe("a person's sign-in addresses, on the tenant path", () => {
  it("may be written by the application for its own company's person", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      await asApp(tx, refs.companyId);
      await tx
        .update(users)
        .set({ email: "new@crew.test", signInPhone: "+14015550177" })
        .where(eq(users.id, refs.workerId));
      const [row] = await tx
        .select({ email: users.email, signInPhone: users.signInPhone })
        .from(users)
        .where(eq(users.id, refs.workerId));
      expect(row).toEqual({ email: "new@crew.test", signInPhone: "+14015550177" });
    });
  });

  it("keeps one address on every row, and each address to one person of a company", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      await asApp(tx, refs.companyId);
      const violation = async (set: Partial<typeof users.$inferInsert>) => {
        const error = (await pgError(
          tx.transaction((sp: Tx) =>
            sp.update(users).set(set).where(eq(users.id, refs.workerId)),
          ),
        )) as { code?: string; constraint?: string };
        return [error.code, error.constraint];
      };
      expect(await violation({ email: null, signInPhone: null })).toEqual([
        "23514",
        "users_sign_in_address_present",
      ]);
      // The admin's email, whatever its case.
      expect(await violation({ email: "A@CO.test" })).toEqual([
        "23505",
        "users_company_id_lower_email_idx",
      ]);
      expect(await violation({ signInPhone: "4015550177" })).toEqual([
        "23514",
        "users_sign_in_phone_e164",
      ]);
    });
  });
});
