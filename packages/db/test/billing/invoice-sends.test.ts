// TASKS R7, recorded sends: the invoice_sends table (0048, 0049), asserted against the
// migrated container. Rolled-back transactions throughout; see helpers.ts. The catalog side
// — FORCE, the policy, the grant matrix — is row-level-security.test.ts's and
// app-role.test.ts's.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { invoiceSends } from "../../src/schema";
import {
  asApp,
  billing,
  type Billing,
  draftInvoice,
  issue,
  lockExclusive,
  pgError,
  rolledBack,
  sqlstate,
  type Tx,
  uuidv7,
} from "../helpers";

async function issued(tx: Tx) {
  const refs = await billing(tx);
  const { invoiceId } = await draftInvoice(tx, refs);
  await issue(tx, refs, invoiceId);
  return { refs, invoiceId };
}

const send = (
  refs: Billing,
  invoiceId: string,
  over: Partial<typeof invoiceSends.$inferInsert> = {},
): typeof invoiceSends.$inferInsert => ({
  id: uuidv7(),
  companyId: refs.companyId,
  invoiceId,
  recipient: "billing@customer.test",
  outcome: "sent",
  providerMessageId: "msg_1",
  sentByUserId: refs.adminId,
  ...over,
});

async function refused(tx: Tx, row: typeof invoiceSends.$inferInsert) {
  const error = (await pgError(
    tx.transaction((sp: Tx) => sp.insert(invoiceSends).values(row)),
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

describe("invoice_sends", () => {
  it("records a send that went and one that failed, any number of times", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId } = await issued(tx);
      await tx.insert(invoiceSends).values(send(refs, invoiceId));
      await tx.insert(invoiceSends).values(
        send(refs, invoiceId, {
          outcome: "failed",
          failure: "provider_refused",
          providerMessageId: null,
        }),
      );
      await tx.insert(invoiceSends).values(send(refs, invoiceId));
      expect(await tx.select().from(invoiceSends)).toHaveLength(3);
    });
  });

  it("refuses a send of a draft and of a void invoice", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId: draft } = await draftInvoice(tx, refs);
      expect(await refused(tx, send(refs, draft))).toEqual({
        code: "23000",
        constraint: "invoice_sends_invoice_issued",
      });
      await issue(tx, refs, draft);
      await tx.execute(sql`
        update invoices set voided_at = now(), voided_by_user_id = ${refs.adminId}
        where id = ${draft}
      `);
      expect(await refused(tx, send(refs, draft))).toEqual({
        code: "23000",
        constraint: "invoice_sends_invoice_issued",
      });
    });
  });

  it("refuses an outcome it does not know and facts that do not belong to it", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId } = await issued(tx);
      for (const [over, constraint] of [
        [{ outcome: "queued" }, "invoice_sends_outcome"],
        // Sent, yet with a failure.
        [{ failure: "provider_refused" }, "invoice_sends_outcome_facts"],
        // Failed, with no code.
        [{ outcome: "failed", providerMessageId: null }, "invoice_sends_outcome_facts"],
        // Failed, yet with a message id.
        [{ outcome: "failed", failure: "timeout" }, "invoice_sends_outcome_facts"],
        [
          { outcome: "failed", failure: "The service said no.", providerMessageId: null },
          "invoice_sends_failure_code",
        ],
      ] as const) {
        expect(await refused(tx, send(refs, invoiceId, over))).toEqual({
          code: "23514",
          constraint,
        });
      }
    });
  });

  it("refuses a recipient that is not one lower-case address", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId } = await issued(tx);
      for (const recipient of [
        "",
        "billing",
        "Billing@Customer.test",
        " billing@customer.test",
        "a@b.test, c@d.test",
        "a@b@c.test",
      ]) {
        expect([
          recipient,
          await refused(tx, send(refs, invoiceId, { recipient })),
        ]).toEqual([
          recipient,
          { code: "23514", constraint: "invoice_sends_recipient_shape" },
        ]);
      }
    });
  });

  it("refuses another company's invoice and another company's sender", async () => {
    await rolledBack(db, async (tx) => {
      const a = await issued(tx);
      const b = await issued(tx);
      expect((await refused(tx, send(a.refs, b.invoiceId))).code).toBe("23503");
      expect(
        (await refused(tx, send(a.refs, a.invoiceId, { sentByUserId: b.refs.adminId })))
          .code,
      ).toBe("23503");
    });
  });

  it("is never updated, deleted or truncated, by anyone", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId } = await issued(tx);
      await tx.insert(invoiceSends).values(send(refs, invoiceId));
      for (const statement of [
        sql`update invoice_sends set recipient = 'other@customer.test'`,
        sql`delete from invoice_sends`,
      ]) {
        const error = await pgError(tx.transaction((sp: Tx) => sp.execute(statement)));
        expect(error.message).toContain("append-only");
      }
      await lockExclusive(tx, ["invoice_sends"]);
      const truncated = await pgError(
        tx.transaction((sp: Tx) => sp.execute(sql`truncate invoice_sends`)),
      );
      expect(truncated.message).toContain("append-only");
    });
  });

  it("lets trader_app record and read its tenant's sends, and change none (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await issued(tx);
      const b = await issued(tx);
      await tx.insert(invoiceSends).values(send(b.refs, b.invoiceId));
      await asApp(tx, a.refs.companyId);
      await tx.insert(invoiceSends).values(send(a.refs, a.invoiceId));
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) =>
            sp.insert(invoiceSends).values(send(b.refs, b.invoiceId)),
          ),
        ),
      ).toBe("42501");
      expect(await tx.select({ id: invoiceSends.id }).from(invoiceSends)).toHaveLength(1);
      for (const statement of [
        sql`update invoice_sends set recipient = 'other@customer.test'`,
        sql`delete from invoice_sends`,
      ]) {
        expect(await sqlstate(tx.transaction((sp: Tx) => sp.execute(statement)))).toBe(
          "42501",
        );
      }
    });
  });
});
