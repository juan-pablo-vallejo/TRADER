// The Resend adapter and the rules around it (server/mailer.ts): what is asked of Resend,
// how each of its answers reads, and who may be sent to in each environment. No network:
// `fetch` is a stand-in that keeps the request.
import { describe, expect, it } from "vitest";

import { deployEnvFaults } from "../src/server/deploy-env";
import {
  allowList,
  createResendMailer,
  mailEnv,
  mailEnvFaults,
  mailerFor,
  RESEND_URL,
} from "../src/server/mailer";

const MAIL = {
  to: "billing@customer.test",
  subject: "Invoice 1042 from D Sierra Painting",
  text: ["Invoice 1042 is attached.", 'Total: 556.40 USD <due> & "owed"'],
  attachment: { filename: "invoice-1042.pdf", content: new Uint8Array([37, 80, 68, 70]) },
  idempotencyKey: "0190a000-0000-7000-8000-000000000001",
};

function recorder(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const send = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve().then(answer);
  }) as unknown as typeof fetch;
  return { calls, send };
}
const accepted = () => Response.json({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });

describe("the Resend mailer", () => {
  it("asks Resend for one message, as its page documents the request", async () => {
    const { calls, send } = recorder(accepted);
    const mailer = createResendMailer({
      apiKey: "re_test_key",
      from: "D Sierra Painting <invoices@mail.test>",
      fetch: send,
    });
    expect(await mailer.send(MAIL)).toEqual({
      ok: true,
      messageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794",
    });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "Idempotency-Key": MAIL.idempotencyKey,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      from: "D Sierra Painting <invoices@mail.test>",
      to: ["billing@customer.test"],
      subject: MAIL.subject,
      html: "<p>Invoice 1042 is attached.</p><p>Total: 556.40 USD &lt;due&gt; &amp; &quot;owed&quot;</p>",
      attachments: [{ filename: "invoice-1042.pdf", content: "JVBERg==" }],
    });
  });

  it("reads a refusal, an unreachable service and a slow one as what they are", async () => {
    const mailer = (send: typeof fetch, timeoutMs?: number) =>
      createResendMailer({
        apiKey: "k",
        from: "f@mail.test",
        fetch: send,
        ...(timeoutMs !== undefined && { timeoutMs }),
      });
    const refused = recorder(() =>
      Response.json({ name: "validation_error", message: "to: x" }, { status: 422 }),
    );
    expect(await mailer(refused.send).send(MAIL)).toEqual({
      ok: false,
      failure: "provider_refused",
    });
    const down = recorder(() => {
      throw new TypeError("fetch failed");
    });
    expect(await mailer(down.send).send(MAIL)).toEqual({
      ok: false,
      failure: "provider_unreachable",
    });
    const slow = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    expect(await mailer(slow, 20).send(MAIL)).toEqual({
      ok: false,
      failure: "provider_unreachable",
    });
  });

  it("counts an accepted message whose answer cannot be read as sent, under no name", async () => {
    const odd = recorder(() => new Response("ok", { status: 200 }));
    const mailer = createResendMailer({
      apiKey: "k",
      from: "f@mail.test",
      fetch: odd.send,
    });
    expect(await mailer.send(MAIL)).toEqual({ ok: true, messageId: null });
  });
});

describe("the mail environment", () => {
  const SERVICE = { RESEND_API_KEY: "re_k", MAIL_FROM: "invoices@mail.test" };

  it("is a service only with both the key and the sender", () => {
    expect(mailEnv({})).toBeNull();
    expect(mailEnv({ RESEND_API_KEY: "re_k", MAIL_FROM: " " })).toBeNull();
    expect(mailEnv({ MAIL_FROM: "invoices@mail.test" })).toBeNull();
    expect(
      mailEnv({ RESEND_API_KEY: " re_k ", MAIL_FROM: " invoices@mail.test " }),
    ).toEqual({
      apiKey: "re_k",
      from: "invoices@mail.test",
    });
  });

  it("names the half that is missing, and nothing when both or neither are set", () => {
    expect(mailEnvFaults({})).toEqual([]);
    expect(mailEnvFaults(SERVICE)).toEqual([]);
    expect(mailEnvFaults({ RESEND_API_KEY: "re_k" })).toEqual(["MAIL_FROM"]);
    expect(mailEnvFaults({ MAIL_FROM: "invoices@mail.test" })).toEqual([
      "RESEND_API_KEY",
    ]);
    // A deployment is refused over it, by name.
    expect(deployEnvFaults({ RESEND_API_KEY: "re_k" })).toContain("MAIL_FROM");
  });

  it("reads the allow-list as trimmed lower-case addresses", () => {
    expect(allowList({})).toEqual([]);
    expect(
      allowList({ INVOICE_EMAIL_ALLOWLIST: " Owner@Test.Invalid , ,b@test.invalid" }),
    ).toEqual(["owner@test.invalid", "b@test.invalid"]);
  });

  it("sends nothing with no service, whatever the environment", async () => {
    const { calls, send } = recorder(accepted);
    for (const env of [
      {},
      { TRADER_ENVIRONMENT: "production" },
      { VERCEL_ENV: "preview" },
    ]) {
      expect(await mailerFor(env, send).send(MAIL)).toEqual({
        ok: false,
        failure: "mail_not_configured",
      });
    }
    expect(calls).toEqual([]);
  });

  it("sends to nobody outside production unless the allow-list names them", async () => {
    // Staging is the staging project's Production deployment: Vercel's own name for the
    // environment says nothing about whose customers a message would reach.
    for (const where of [
      {},
      { VERCEL_ENV: "preview" },
      { VERCEL_ENV: "production" },
      { VERCEL_ENV: "production", TRADER_ENVIRONMENT: "staging" },
      { VERCEL_ENV: "production", TRADER_ENVIRONMENT: "Production" },
    ]) {
      const { calls, send } = recorder(accepted);
      expect(await mailerFor({ ...SERVICE, ...where }, send).send(MAIL)).toEqual({
        ok: false,
        failure: "recipient_not_allowed",
      });
      expect(calls).toEqual([]);
      const listed = {
        ...SERVICE,
        ...where,
        INVOICE_EMAIL_ALLOWLIST: "Billing@Customer.test",
      };
      expect((await mailerFor(listed, send).send(MAIL)).ok).toBe(true);
      expect(calls).toHaveLength(1);
    }
  });

  it("sends to anyone in production with no list, and only to the list when there is one", async () => {
    const { calls, send } = recorder(accepted);
    const production = { ...SERVICE, TRADER_ENVIRONMENT: "production" };
    expect((await mailerFor(production, send).send(MAIL)).ok).toBe(true);
    expect(
      await mailerFor(
        { ...production, INVOICE_EMAIL_ALLOWLIST: "other@test.invalid" },
        send,
      ).send(MAIL),
    ).toEqual({ ok: false, failure: "recipient_not_allowed" });
    expect(calls).toHaveLength(1);
  });
});
