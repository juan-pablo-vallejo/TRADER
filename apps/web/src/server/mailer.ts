// The mail service this server hands to invoice.send (packages/api, core/mailer.ts): Resend
// over its HTTP API, read per call from the environment (invoice delivery
// only). No mail package: one POST.
//
// Three variables (.env.example): `RESEND_API_KEY` and `MAIL_FROM` together make a mail
// service; blank, every send fails closed as `mail_not_configured`. `INVOICE_EMAIL_ALLOWLIST`
// names who may be sent to. Anywhere but production the list is the whole of it — a
// deployment with no list sends to nobody — so a staging or development server can never
// mail a customer by accident; in production a blank list means no restriction.
//
// The request is Resend's as its page documents it (resend.com/docs/api-reference/emails/
// send-email, read 2026-11-15): `from`, `to`, `subject`, `html`, `attachments` with base64
// `content` and a `filename`, a bearer key, and an `Idempotency-Key` so a repeat of one send
// is one message. Its answer's `id` is kept; nothing else of an answer is read, and a
// refusal's body is never kept or reported — it may quote the address.
import { type Mail, type Mailer, restrictedTo, unconfiguredMailer } from "@trader/api";
import { traderEnvironment } from "./environment";

type Env = Record<string, string | undefined>;

export const RESEND_URL = "https://api.resend.com/emails";
// Inside invoice.send's transaction, which holds the invoice's row: short.
export const MAIL_TIMEOUT_MS = 8_000;

const blank = (value: string | undefined) => value === undefined || value.trim() === "";

export function mailEnv(env: Env): { apiKey: string; from: string } | null {
  if (blank(env.RESEND_API_KEY) || blank(env.MAIL_FROM)) return null;
  return { apiKey: env.RESEND_API_KEY!.trim(), from: env.MAIL_FROM!.trim() };
}

// Half a mail service is a mistake, not a choice: named so a deployment refuses to start.
export function mailEnvFaults(env: Env): string[] {
  if (blank(env.RESEND_API_KEY) === blank(env.MAIL_FROM)) return [];
  return [blank(env.RESEND_API_KEY) ? "RESEND_API_KEY" : "MAIL_FROM"];
}

export const allowList = (env: Env): string[] =>
  (env.INVOICE_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a !== "");

const escaped = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );

export function createResendMailer(deps: {
  apiKey: string;
  from: string;
  fetch: typeof fetch;
  timeoutMs?: number;
}): Mailer {
  return {
    async send(mail: Mail) {
      let response: Response;
      try {
        response = await deps.fetch(RESEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deps.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": mail.idempotencyKey,
          },
          body: JSON.stringify({
            from: deps.from,
            to: [mail.to],
            subject: mail.subject,
            html: mail.text.map((line) => `<p>${escaped(line)}</p>`).join(""),
            attachments: [
              {
                filename: mail.attachment.filename,
                content: Buffer.from(mail.attachment.content).toString("base64"),
              },
            ],
          }),
          signal: AbortSignal.timeout(deps.timeoutMs ?? MAIL_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, failure: "provider_unreachable" };
      }
      if (!response.ok) return { ok: false, failure: "provider_refused" };
      try {
        const body = (await response.json()) as { id?: unknown };
        return { ok: true, messageId: typeof body.id === "string" ? body.id : null };
      } catch {
        // Accepted, with an answer that could not be read: sent, under no name.
        return { ok: true, messageId: null };
      }
    },
  };
}

// The mailer for an environment, as the route hands it to every request.
export function mailerFor(env: Env, send: typeof fetch): Mailer {
  const service = mailEnv(env);
  if (service === null) return unconfiguredMailer;
  const mailer = createResendMailer({ ...service, fetch: send });
  const allowed = allowList(env);
  // TRADER's own production, never Vercel's: staging is its project's Production
  // deployment, and there the list stays the whole of who may be sent to.
  return traderEnvironment(env) === "production" && allowed.length === 0
    ? mailer
    : restrictedTo(allowed, mailer);
}

export const webMailer: Mailer = {
  send: (mail) => mailerFor(process.env, fetch).send(mail),
};
