// The mail seam (ARCHITECTURE: Email, invoice delivery only; RULES, thin seams). The API
// knows a message and whether it went; which service carries it is the host's (apps/web,
// server/mailer.ts). A mailer never throws: every way a send can fail is an answer with a
// short code, which is what the send's record keeps — never the service's own message,
// which may quote an address.
export type Mail = {
  to: string;
  subject: string;
  // Plain words, a paragraph a line.
  text: string[];
  attachment: { filename: string; content: Uint8Array };
  // The send's own id: the service is asked to treat a repeat of it as the same message.
  idempotencyKey: string;
};

export type MailResult =
  { ok: true; messageId: string | null } | { ok: false; failure: MailFailure };

export const MAIL_FAILURES = [
  // This deployment has no mail service set.
  "mail_not_configured",
  // The deployment's allow-list does not name the recipient; nothing was sent.
  "recipient_not_allowed",
  // The service answered and refused the message.
  "provider_refused",
  // The service could not be reached, or did not answer in time.
  "provider_unreachable",
] as const;
export type MailFailure = (typeof MAIL_FAILURES)[number];

export interface Mailer {
  send(mail: Mail): Promise<MailResult>;
}

// What a context has when its host named no mailer: every send fails closed, and says why.
export const unconfiguredMailer: Mailer = {
  send: () => Promise.resolve({ ok: false, failure: "mail_not_configured" }),
};

// A mailer that sends only to the addresses a deployment names (staging: the owner's test
// recipients). Anything else is answered without the service being asked.
export function restrictedTo(allowed: readonly string[], mailer: Mailer): Mailer {
  const list = new Set(
    allowed.map((a) => a.trim().toLowerCase()).filter((a) => a !== ""),
  );
  return {
    send: (mail) =>
      list.has(mail.to.trim().toLowerCase())
        ? mailer.send(mail)
        : Promise.resolve({ ok: false, failure: "recipient_not_allowed" }),
  };
}
