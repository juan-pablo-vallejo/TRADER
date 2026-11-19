// invoice.send: an issued invoice's page sent by email, each send recorded. The
// mail service here is a stand-in that keeps what it was handed and answers as it is told;
// the real adapter is apps/web's (server/mailer.ts). Rolled-back transactions; the table's
// own guards are the db suite's (billing/invoice-sends.test.ts).
import { invoiceCounters, invoiceSends } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import {
  type Mail,
  type Mailer,
  type MailResult,
  restrictedTo,
  unconfiguredMailer,
} from "../../src/core/mailer";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  workDayIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

function recordingMailer(answer: MailResult = { ok: true, messageId: "msg_1" }) {
  const sent: Mail[] = [];
  const mailer: Mailer = {
    send: (mail) => {
      sent.push(mail);
      return Promise.resolve(answer);
    },
  };
  return { sent, mailer };
}

const TO = "billing@customer.test";

// An issued invoice of 520.00 with 36.40 tax in a company whose series starts at 1042, and
// a caller for each mailer a test brings.
async function office(tx: Tx) {
  const day = await workDayIn(tx);
  const other = await workDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const worker = await boundIn(tx, day.companyId, "worker");
  const foreign = await boundIn(tx, other.companyId, "admin");
  await tx.insert(invoiceCounters).values({
    companyId: day.companyId,
    nextInvoiceNumber: 1042,
  });
  await becomeApp(tx);
  const as = (who: unknown, mailer?: Mailer) => appCallerIn(tx, who, mailer).invoice;
  const bill = as(admin.who);
  const invoiceId = uuidv7();
  await bill.create({ id: invoiceId, jobId: day.J, currency: "USD" });
  await bill.save({
    invoiceId,
    taxCents: 3640,
    lines: [
      {
        id: uuidv7(),
        description: "Interior repaint",
        quantity: "8",
        unit: "h",
        unitPriceCents: 6500,
      },
    ],
  });
  const rows = async () => {
    await tx.execute(sql`reset role`);
    const found = await tx
      .select({
        id: invoiceSends.id,
        recipient: invoiceSends.recipient,
        outcome: invoiceSends.outcome,
        failure: invoiceSends.failure,
        providerMessageId: invoiceSends.providerMessageId,
        sentByUserId: invoiceSends.sentByUserId,
      })
      .from(invoiceSends)
      .where(eq(invoiceSends.companyId, day.companyId));
    await becomeApp(tx);
    await tx.execute(sql`select set_config('app.company_id', ${day.companyId}, true)`);
    return found;
  };
  return { day, other, admin, worker, foreign, as, bill, invoiceId, rows };
}

describe("invoice.send, for the closed company: the Demo door's, in production", () => {
  it("emails only the deployment's allow-list, blank meaning nobody, and asks the service nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o.bill.issue({ invoiceId: o.invoiceId });
      const { sent, mailer } = recordingMailer();
      const closedTo = (allowed: string[]) =>
        appCallerIn(tx, o.admin.who, mailer, { companyId: o.day.companyId, allowed })
          .invoice;
      // No list: nobody, though the same deployment lets every other company mail anyone.
      expect(
        await closedTo([]).send({ id: uuidv7(), invoiceId: o.invoiceId, to: TO }),
      ).toEqual({ result: "failed", failure: "recipient_not_allowed" });
      // A list that does not name the address: still nobody.
      expect(
        await closedTo(["owner@jpteq.test"]).send({
          id: uuidv7(),
          invoiceId: o.invoiceId,
          to: TO,
        }),
      ).toEqual({ result: "failed", failure: "recipient_not_allowed" });
      expect(sent).toEqual([]);
      // On the list: sent.
      expect(
        await closedTo([TO]).send({ id: uuidv7(), invoiceId: o.invoiceId, to: TO }),
      ).toEqual({ result: "sent" });
      expect(sent.map((m) => m.to)).toEqual([TO]);
    });
  });

  it("touches no other company, and nothing where no company is closed, as on staging", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o.bill.issue({ invoiceId: o.invoiceId });
      const { sent, mailer } = recordingMailer();
      // Production, the closed company being another one: this one mails anyone.
      const beside = appCallerIn(tx, o.admin.who, mailer, {
        companyId: o.other.companyId,
        allowed: [],
      }).invoice;
      expect(await beside.send({ id: uuidv7(), invoiceId: o.invoiceId, to: TO })).toEqual(
        { result: "sent" },
      );
      // Staging: no company is closed, and the host's own mailer is the whole rule.
      expect(
        await o
          .as(o.admin.who, mailer)
          .send({ id: uuidv7(), invoiceId: o.invoiceId, to: "second@customer.test" }),
      ).toEqual({ result: "sent" });
      expect(sent.map((m) => m.to)).toEqual([TO, "second@customer.test"]);
    });
  });
});

describe("invoice.send", () => {
  it("sends the issued invoice's page to the address given and records the send", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o.bill.issue({ invoiceId: o.invoiceId });
      const { sent, mailer } = recordingMailer();
      const id = uuidv7();
      expect(
        await o
          .as(o.admin.who, mailer)
          .send({ id, invoiceId: o.invoiceId, to: "  Billing@Customer.TEST " }),
      ).toEqual({ result: "sent" });

      expect(sent).toHaveLength(1);
      const mail = sent[0]!;
      expect(mail.to).toBe(TO);
      expect(mail.idempotencyKey).toBe(id);
      expect(mail.subject).toMatch(/^Invoice 1042 from /);
      expect(mail.text.join(" ")).toContain("Total: 556.40 USD");
      expect(mail.text.join(" ")).toContain("Amount owed: 556.40 USD");
      // The attachment is the page invoice.pdf answers, byte for byte.
      const page = await o.bill.pdf({ invoiceId: o.invoiceId });
      if (page.result !== "rendered") throw new Error("not rendered");
      expect(mail.attachment.filename).toBe("invoice-1042.pdf");
      expect(Buffer.from(mail.attachment.content).toString("base64")).toBe(page.pdf);

      expect(await o.rows()).toEqual([
        {
          id,
          recipient: TO,
          outcome: "sent",
          failure: null,
          providerMessageId: "msg_1",
          sentByUserId: o.admin.id,
        },
      ]);
      const read = await o.bill.read({ invoiceId: o.invoiceId });
      expect(read.sends).toMatchObject([
        { id, recipient: TO, outcome: "sent", failure: null },
      ]);
    });
  });

  it("answers a request sent again with what the first did, and mails once", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o.bill.issue({ invoiceId: o.invoiceId });
      const { sent, mailer } = recordingMailer();
      const call = { id: uuidv7(), invoiceId: o.invoiceId, to: TO };
      const bill = o.as(o.admin.who, mailer);
      expect(await bill.send(call)).toEqual({ result: "sent" });
      expect(await bill.send(call)).toEqual({ result: "duplicate", outcome: "sent" });
      expect(sent).toHaveLength(1);
      expect(await o.rows()).toHaveLength(1);
      // The same id for another address is not the same request.
      expect(await bill.send({ ...call, to: "other@customer.test" })).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(sent).toHaveLength(1);
    });
  });

  it("records a failed send with its code, and can be sent again", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o.bill.issue({ invoiceId: o.invoiceId });
      const down = recordingMailer({ ok: false, failure: "provider_unreachable" });
      const first = uuidv7();
      expect(
        await o
          .as(o.admin.who, down.mailer)
          .send({ id: first, invoiceId: o.invoiceId, to: TO }),
      ).toEqual({ result: "failed", failure: "provider_unreachable" });
      expect(
        await o
          .as(o.admin.who, down.mailer)
          .send({ id: first, invoiceId: o.invoiceId, to: TO }),
      ).toEqual({ result: "duplicate", outcome: "failed" });
      expect(down.sent).toHaveLength(1);

      const up = recordingMailer();
      expect(
        await o
          .as(o.admin.who, up.mailer)
          .send({ id: uuidv7(), invoiceId: o.invoiceId, to: TO }),
      ).toEqual({ result: "sent" });
      expect(
        (await o.rows()).map((r) => [r.outcome, r.failure, r.providerMessageId]),
      ).toEqual([
        ["failed", "provider_unreachable", null],
        ["sent", null, "msg_1"],
      ]);
    });
  });

  it("sends nothing for a draft or a void invoice, and records nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const { sent, mailer } = recordingMailer();
      const bill = o.as(o.admin.who, mailer);
      const call = () => ({ id: uuidv7(), invoiceId: o.invoiceId, to: TO });
      expect(await bill.send(call())).toEqual({ result: "rejected", code: "not_issued" });
      await o.bill.issue({ invoiceId: o.invoiceId });
      await o.bill.void({ invoiceId: o.invoiceId });
      expect(await bill.send(call())).toEqual({ result: "rejected", code: "void" });
      expect(sent).toEqual([]);
      expect(await o.rows()).toEqual([]);
    });
  });

  it("goes only to an address the deployment's allow-list names, when it has one", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o.bill.issue({ invoiceId: o.invoiceId });
      const { sent, mailer } = recordingMailer();
      const bill = o.as(o.admin.who, restrictedTo([" Owner@Test.Invalid "], mailer));
      expect(await bill.send({ id: uuidv7(), invoiceId: o.invoiceId, to: TO })).toEqual({
        result: "failed",
        failure: "recipient_not_allowed",
      });
      expect(sent).toEqual([]);
      expect(
        await bill.send({
          id: uuidv7(),
          invoiceId: o.invoiceId,
          to: "owner@test.invalid",
        }),
      ).toEqual({ result: "sent" });
      expect(sent.map((m) => m.to)).toEqual(["owner@test.invalid"]);
      expect((await o.rows()).map((r) => [r.recipient, r.failure])).toEqual([
        [TO, "recipient_not_allowed"],
        ["owner@test.invalid", null],
      ]);
    });
  });

  it("fails closed where no mail service is set", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o.bill.issue({ invoiceId: o.invoiceId });
      // The caller every other suite uses names no mailer at all.
      expect(await o.bill.send({ id: uuidv7(), invoiceId: o.invoiceId, to: TO })).toEqual(
        {
          result: "failed",
          failure: "mail_not_configured",
        },
      );
      expect(await unconfiguredMailer.send({} as Mail)).toEqual({
        ok: false,
        failure: "mail_not_configured",
      });
    });
  });

  it("refuses an address that is not one, another company's invoice, and anyone but an admin", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await o.bill.issue({ invoiceId: o.invoiceId });
      const { sent, mailer } = recordingMailer();
      const call = (to: string) => ({ id: uuidv7(), invoiceId: o.invoiceId, to });
      for (const to of ["", "billing", "a@b.test, c@d.test", "a@b@c.test"]) {
        expect([to, await outcome(o.as(o.admin.who, mailer).send(call(to)))]).toEqual([
          to,
          "BAD_REQUEST",
        ]);
      }
      expect(await outcome(o.as(o.worker.who, mailer).send(call(TO)))).toBe("FORBIDDEN");
      expect(await outcome(o.as(o.foreign.who, mailer).send(call(TO)))).toBe("FORBIDDEN");
      expect(sent).toEqual([]);
      expect(await o.rows()).toEqual([]);
    });
  });
});
