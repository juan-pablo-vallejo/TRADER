// Stage 2 line 5: the invoice lifecycle, gap-free numbering and credit-memo rules — the
// triggers of migration 0010 — asserted against the migrated container. Rolled-back
// transactions throughout, except the two lock tests at the end, which need rows two
// connections can both see and therefore commit a fixture and delete it after.
import { count, eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { creditMemos, invoiceCounters, invoiceLineItems, invoices } from "../src/schema";
import {
  billing,
  type Billing,
  committedBilling,
  draftInvoice,
  issue,
  line,
  one,
  pgError,
  rolledBack,
  sqlstate,
  type Tx,
} from "./helpers";

type MemoInsert = Omit<typeof creditMemos.$inferInsert, "number"> & { number: SQL };

const memo = (refs: Billing, invoiceId: string): MemoInsert => ({
  companyId: refs.companyId,
  invoiceId,
  currency: "USD",
  number: sql`NULL`,
  amountCents: 5000,
  reason: "Touch-up not completed",
  issuedByUserId: refs.adminId,
});

const voidIt = (tx: Tx, refs: Billing, invoiceId: string) =>
  tx
    .update(invoices)
    .set({ voidedAt: new Date(), voidedByUserId: refs.adminId })
    .where(eq(invoices.id, invoiceId))
    .returning({ voidedAt: invoices.voidedAt });

async function counter(tx: Tx, companyId: string) {
  return one(
    await tx
      .select({
        invoice: invoiceCounters.nextInvoiceNumber,
        memo: invoiceCounters.nextCreditMemoNumber,
      })
      .from(invoiceCounters)
      .where(eq(invoiceCounters.companyId, companyId)),
  );
}

async function lineCount(tx: Tx, invoiceId: string) {
  return one(
    await tx
      .select({ n: count() })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId)),
  ).n;
}

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("issue", () => {
  it("assigns the counter's number and advances the counter", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      expect((await issue(tx, refs, invoiceId)).number).toBe(1042);
      expect((await counter(tx, refs.companyId)).invoice).toBe(1043);
    });
  });

  it("numbers two issues in one transaction consecutively", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const first = await draftInvoice(tx, refs);
      const second = await draftInvoice(tx, refs);
      expect((await issue(tx, refs, first.invoiceId)).number).toBe(1042);
      expect((await issue(tx, refs, second.invoiceId)).number).toBe(1043);
    });
  });

  it("leaves no gap when an issue is rolled back", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      const abandoned = Symbol("abandoned");
      await tx
        .transaction(async (sp) => {
          expect((await issue(sp, refs, invoiceId)).number).toBe(1042);
          throw abandoned;
        })
        .catch((error: unknown) => {
          if (error !== abandoned) throw error;
        });
      expect((await counter(tx, refs.companyId)).invoice).toBe(1042);
      expect((await issue(tx, refs, invoiceId)).number).toBe(1042);
    });
  });

  it("refuses a caller-supplied number", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      const error = await pgError(
        tx
          .update(invoices)
          .set({ number: 1042, issuedAt: new Date(), issuedByUserId: refs.adminId })
          .where(eq(invoices.id, invoiceId)),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toContain("never supplied");
    });
  });

  it("refuses to issue when the company has no counter row", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await tx
        .delete(invoiceCounters)
        .where(eq(invoiceCounters.companyId, refs.companyId));
      const error = await pgError(issue(tx, refs, invoiceId));
      expect(error.code).toBe("23000");
      expect(error.message).toContain("no number series");
    });
  });

  it("refuses to issue an invoice with no lines", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId, lineId } = await draftInvoice(tx, refs);
      await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.id, lineId));
      const error = await pgError(issue(tx, refs, invoiceId));
      expect(error.code).toBe("23000");
      expect(error.message).toContain("at least one line");
    });
  });

  it("refuses an invoice inserted already issued", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const error = await pgError(
        tx.insert(invoices).values({
          companyId: refs.companyId,
          customerId: refs.customerId,
          jobId: refs.jobId,
          currency: "USD",
          taxCents: 0,
          issuedAt: new Date(),
          issuedByUserId: refs.adminId,
        }),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toContain("born a draft");
    });
  });
});

describe("issued invoices", () => {
  it("refuse UPDATE and the row survives", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      const code = await sqlstate(
        tx.transaction((sp) =>
          sp.update(invoices).set({ taxCents: 100 }).where(eq(invoices.id, invoiceId)),
        ),
      );
      expect(code).toBe("23000");
      const row = one(
        await tx
          .select({ taxCents: invoices.taxCents })
          .from(invoices)
          .where(eq(invoices.id, invoiceId)),
      );
      expect(row.taxCents).toBe(0);
    });
  });

  it("accept one void that changes nothing else", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      expect(one(await voidIt(tx, refs, invoiceId)).voidedAt).toBeInstanceOf(Date);
    });
  });

  it("refuse a void that also changes something", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      const code = await sqlstate(
        tx
          .update(invoices)
          .set({ voidedAt: new Date(), voidedByUserId: refs.adminId, taxCents: 100 })
          .where(eq(invoices.id, invoiceId)),
      );
      expect(code).toBe("23000");
    });
  });

  it("refuse a second void", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      await voidIt(tx, refs, invoiceId);
      expect(await sqlstate(voidIt(tx, refs, invoiceId))).toBe("23000");
    });
  });

  it("refuse DELETE", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      const error = await pgError(tx.delete(invoices).where(eq(invoices.id, invoiceId)));
      expect(error.code).toBe("23000");
      expect(error.message).toContain("never deleted");
    });
  });

  it("refuse a line INSERT, UPDATE and DELETE", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId, lineId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      const attempts = [
        (sp: Tx) =>
          sp.insert(invoiceLineItems).values({ ...line(refs, invoiceId), position: 1 }),
        (sp: Tx) =>
          sp
            .update(invoiceLineItems)
            .set({ description: "Edited" })
            .where(eq(invoiceLineItems.id, lineId)),
        (sp: Tx) => sp.delete(invoiceLineItems).where(eq(invoiceLineItems.id, lineId)),
      ];
      for (const attempt of attempts) {
        const error = await pgError(
          tx.transaction(async (sp) => void (await attempt(sp))),
        );
        expect(error.code).toBe("23000");
        expect(error.message).toContain("the invoice is issued");
      }
      expect(await lineCount(tx, invoiceId)).toBe(1);
    });
  });
});

describe("draft invoices", () => {
  it("delete with their lines", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await tx.delete(invoices).where(eq(invoices.id, invoiceId));
      expect(await lineCount(tx, invoiceId)).toBe(0);
    });
  });
});

describe("credit memos", () => {
  it("are numbered from their own series", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      const rows = await tx
        .insert(creditMemos)
        .values([memo(refs, invoiceId), memo(refs, invoiceId)])
        .returning({ number: creditMemos.number });
      expect(rows.map((r) => r.number)).toEqual([7, 8]);
      expect(await counter(tx, refs.companyId)).toEqual({ invoice: 1043, memo: 9 });
    });
  });

  it("refuse a caller-supplied number", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      const error = await pgError(
        tx.insert(creditMemos).values({ ...memo(refs, invoiceId), number: sql`7` }),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toContain("never supplied");
    });
  });

  it("refuse a draft invoice", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      const error = await pgError(tx.insert(creditMemos).values(memo(refs, invoiceId)));
      expect(error.code).toBe("23000");
      expect(error.message).toContain("issued, unvoided");
    });
  });

  it("refuse a voided invoice", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      await voidIt(tx, refs, invoiceId);
      expect(await sqlstate(tx.insert(creditMemos).values(memo(refs, invoiceId)))).toBe(
        "23000",
      );
    });
  });

  it("refuse UPDATE, DELETE and TRUNCATE", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      await issue(tx, refs, invoiceId);
      const row = one(
        await tx
          .insert(creditMemos)
          .values(memo(refs, invoiceId))
          .returning({ id: creditMemos.id }),
      );
      const attempts = [
        (sp: Tx) =>
          sp
            .update(creditMemos)
            .set({ amountCents: 1 })
            .where(eq(creditMemos.id, row.id)),
        (sp: Tx) => sp.delete(creditMemos).where(eq(creditMemos.id, row.id)),
        (sp: Tx) => sp.execute(sql`TRUNCATE credit_memos CASCADE`),
      ];
      for (const attempt of attempts) {
        const error = await pgError(
          tx.transaction(async (sp) => void (await attempt(sp))),
        );
        expect(error.code).toBe("23000");
        expect(error.message).toContain("append-only");
      }
    });
  });
});

// Two connections, each in its own transaction, both rolled back. The fixture is committed
// so both can see it, and deleted after.
describe("row locks", () => {
  const ISSUE =
    "UPDATE invoices SET issued_at = now(), issued_by_user_id = $2 WHERE id = $1 RETURNING number";

  it("make an issue wait for a transaction editing a line", async () => {
    const f = await committedBilling(db);
    const a = await db.$client.connect();
    const b = await db.$client.connect();
    try {
      await a.query("BEGIN");
      // Holds FOR SHARE on the invoice through the line trigger; an INSERT would hold
      // FOR KEY SHARE through the foreign key anyway, which this UPDATE does not.
      await a.query(
        "UPDATE invoice_line_items SET description = 'Edited' WHERE id = $1",
        [f.lineId],
      );
      await b.query("BEGIN");
      await b.query("SET LOCAL lock_timeout = '500ms'");
      const blocked = await b
        .query(ISSUE, [f.invoiceId, f.adminId])
        .catch((e: unknown) => e);
      expect((blocked as { code?: string }).code).toBe("55P03");
      await b.query("ROLLBACK");
      await a.query("ROLLBACK");
      await b.query("BEGIN");
      const retry = await b.query<{ number: number }>(ISSUE, [f.invoiceId, f.adminId]);
      expect(retry.rows[0]?.number).toBe(1042);
      await b.query("ROLLBACK");
    } finally {
      // A failed assertion leaves a transaction open; end it before the client goes back.
      await a.query("ROLLBACK").catch(() => undefined);
      await b.query("ROLLBACK").catch(() => undefined);
      a.release();
      b.release();
      await f.cleanup();
    }
  });

  it("make a line delete wait for a transaction issuing the invoice", async () => {
    const f = await committedBilling(db);
    const a = await db.$client.connect();
    const b = await db.$client.connect();
    try {
      await a.query("BEGIN");
      await a.query(ISSUE, [f.invoiceId, f.adminId]);
      await b.query("BEGIN");
      await b.query("SET LOCAL lock_timeout = '500ms'");
      const blocked = await b
        .query("DELETE FROM invoice_line_items WHERE id = $1", [f.lineId])
        .catch((e: unknown) => e);
      expect((blocked as { code?: string }).code).toBe("55P03");
      await a.query("ROLLBACK");
      await b.query("ROLLBACK");
      await b.query("BEGIN");
      const retry = await b.query("DELETE FROM invoice_line_items WHERE id = $1", [
        f.lineId,
      ]);
      expect(retry.rowCount).toBe(1);
      await b.query("ROLLBACK");
    } finally {
      // A failed assertion leaves a transaction open; end it before the client goes back.
      await a.query("ROLLBACK").catch(() => undefined);
      await b.query("ROLLBACK").catch(() => undefined);
      a.release();
      b.release();
      await f.cleanup();
    }
  });
});
