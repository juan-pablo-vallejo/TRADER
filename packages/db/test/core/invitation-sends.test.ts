// The record of an invitation's sends: the invitation_sends table, asserted against the
// migrated container. Rolled-back transactions throughout; see helpers.ts. The catalog side
// — FORCE, the policy, the grant matrix — is row-level-security.test.ts's and
// app-role.test.ts's.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { invitationSends } from "../../src/schema";
import {
  asApp,
  billing,
  type Billing,
  pgError,
  rolledBack,
  sqlstate,
  type Tx,
  uuidv7,
} from "../helpers";

type Row = typeof invitationSends.$inferInsert;

const emailed = (refs: Billing, over: Partial<Row> = {}): Row => ({
  id: uuidv7(),
  companyId: refs.companyId,
  userId: refs.workerId,
  channel: "email",
  recipient: "worker@crew.test",
  outcome: "sent",
  providerMessageId: "msg_1",
  sentByUserId: refs.adminId,
  ...over,
});

const texted = (refs: Billing, over: Partial<Row> = {}): Row => ({
  id: uuidv7(),
  companyId: refs.companyId,
  userId: refs.workerId,
  channel: "text",
  recipient: "+14015550123",
  outcome: "sent",
  sentByUserId: refs.adminId,
  ...over,
});

async function refused(tx: Tx, row: Row) {
  const error = (await pgError(
    tx.transaction((sp: Tx) => sp.insert(invitationSends).values(row)),
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

describe("invitation_sends", () => {
  it("records an email that went, one that failed, and a text, any number of times", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      await tx.insert(invitationSends).values(emailed(refs));
      await tx.insert(invitationSends).values(
        emailed(refs, {
          outcome: "failed",
          failure: "provider_refused",
          providerMessageId: null,
        }),
      );
      await tx.insert(invitationSends).values(texted(refs));
      await tx.insert(invitationSends).values(texted(refs));
      expect(await tx.select().from(invitationSends)).toHaveLength(4);
    });
  });

  it("refuses a channel or an outcome it does not know, and facts that do not belong", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      for (const [row, constraint] of [
        [emailed(refs, { channel: "push" }), "invitation_sends_channel"],
        [emailed(refs, { outcome: "queued" }), "invitation_sends_outcome"],
        // Sent, yet with a failure.
        [
          emailed(refs, { failure: "provider_refused" }),
          "invitation_sends_outcome_facts",
        ],
        // Failed, with no code.
        [
          emailed(refs, { outcome: "failed", providerMessageId: null }),
          "invitation_sends_outcome_facts",
        ],
        // Failed, yet with a message id.
        [
          emailed(refs, { outcome: "failed", failure: "timeout" }),
          "invitation_sends_outcome_facts",
        ],
        [
          emailed(refs, {
            outcome: "failed",
            failure: "The service said no.",
            providerMessageId: null,
          }),
          "invitation_sends_failure_code",
        ],
        // A text is only noted as opened to send: the server has no failure of it, and no
        // service ever named it.
        [
          texted(refs, { outcome: "failed", failure: "provider_refused" }),
          "invitation_sends_outcome_facts",
        ],
        [texted(refs, { providerMessageId: "msg_1" }), "invitation_sends_outcome_facts"],
      ] as const) {
        expect([constraint, await refused(tx, row)]).toEqual([
          constraint,
          { code: "23514", constraint },
        ]);
      }
    });
  });

  it("holds the recipient to the channel's own kind of address", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const shape = { code: "23514", constraint: "invitation_sends_recipient_shape" };
      for (const recipient of [
        "",
        "worker",
        "Worker@Crew.test",
        " worker@crew.test",
        "a@b.test, c@d.test",
        // A number is not where an email goes.
        "+14015550123",
      ]) {
        expect([recipient, await refused(tx, emailed(refs, { recipient }))]).toEqual([
          recipient,
          shape,
        ]);
      }
      for (const recipient of [
        "",
        "4015550123",
        "+1 401 555 0123",
        "+14015550",
        "+11015550123",
        "+442079460958",
        // An email is not where a text goes.
        "worker@crew.test",
      ]) {
        expect([recipient, await refused(tx, texted(refs, { recipient }))]).toEqual([
          recipient,
          shape,
        ]);
      }
    });
  });

  it("refuses another company's person and another company's sender", async () => {
    await rolledBack(db, async (tx) => {
      const a = await billing(tx);
      const b = await billing(tx, { name: "Other Co", timezone: "America/New_York" });
      expect(await refused(tx, emailed(a, { userId: b.workerId }))).toEqual({
        code: "23503",
        constraint: "invitation_sends_company_id_user_id_fk",
      });
      expect(await refused(tx, emailed(a, { sentByUserId: b.adminId }))).toEqual({
        code: "23503",
        constraint: "invitation_sends_company_id_sent_by_user_id_fk",
      });
    });
  });

  it("is written once: no update, no delete, no truncate, the owner included", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const row = emailed(refs);
      await tx.insert(invitationSends).values(row);
      for (const statement of [
        sql`update invitation_sends set outcome = 'failed' where id = ${row.id}`,
        sql`delete from invitation_sends where id = ${row.id}`,
        sql`truncate invitation_sends`,
      ]) {
        expect(await sqlstate(tx.transaction((sp: Tx) => sp.execute(statement)))).toBe(
          "23000",
        );
      }
      expect(await tx.select().from(invitationSends)).toHaveLength(1);
    });
  });

  it("lets the application add and read its own company's, and no other's", async () => {
    await rolledBack(db, async (tx) => {
      const a = await billing(tx);
      const b = await billing(tx, { name: "Other Co", timezone: "America/New_York" });
      await tx.insert(invitationSends).values(emailed(b));
      await asApp(tx, a.companyId);
      await tx.insert(invitationSends).values(texted(a));
      expect(await tx.select().from(invitationSends)).toHaveLength(1);
      // Another company's row cannot be written from here.
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) => sp.insert(invitationSends).values(emailed(b))),
        ),
      ).toBe("42501");
    });
  });
});
