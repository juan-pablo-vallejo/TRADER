// Clerk as the identity directory (packages/api identity.ts, IdentityDirectory): roster.invite
// admits a person by creating their Clerk user, since the instance is invitation-only and
// Clerk has no invitation by SMS. Clerk marks an address created this way as verified; the
// person still proves it is theirs, by the code sent to it at every sign-in.
//
// One documented call, Clerk's Backend API `POST /v1/users`, made with `fetch` so that its
// timeout and every answer it can give are stated here. What was read on the development
// instance (2026-11-12): a number alone is accepted; an address another user holds answers
// 422 `form_identifier_exists` naming that address; an email with no number answers 422
// `form_data_missing`, because the instance requires a number.
//
// "Already admitted" is success, and silent: a second invitation of the same number — a
// retry, another company's — must neither fail nor say that the number is known (ARCHITECTURE,
// phone identity). The number is what must end up with a login, so when only the email is
// held by an existing user the person is created by number alone.
//
// Nothing of a response is kept or thrown: it names the person. An error carries the HTTP
// status and Clerk's error codes, no more.
import type { IdentityDirectory } from "@trader/api";

const USERS_URL = "https://api.clerk.com/v1/users";

// roster.invite waits on this inside its transaction (roster/invite.ts): bounded, so a
// stalled provider costs one admin a failed invitation and never a held connection.
export const ADMIT_TIMEOUT_MS = 5_000;

const EXISTS = "form_identifier_exists";

export class ClerkDirectoryError extends Error {
  constructor(
    readonly status: number,
    readonly codes: readonly string[],
  ) {
    super(`Clerk refused the user: ${String(status)} ${codes.join(",")}`);
    this.name = "ClerkDirectoryError";
  }
}

type Answer = { status: number; errors: { code: string; param: string | null }[] };

const CODE = /^[a-z0-9_]{1,64}$/;

function errorsOf(body: unknown): Answer["errors"] {
  const list = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(list)) return [];
  return list.flatMap((e: unknown) => {
    const code = (e as { code?: unknown } | null)?.code;
    const param = (e as { meta?: { param_name?: unknown } } | null)?.meta?.param_name;
    if (typeof code !== "string" || !CODE.test(code)) return [];
    return [{ code, param: typeof param === "string" ? param : null }];
  });
}

export function createClerkDirectory(deps: {
  secretKey: string;
  fetch: typeof fetch;
}): IdentityDirectory {
  const create = async (person: {
    email: string | null;
    phone: string;
  }): Promise<Answer> => {
    const response = await deps.fetch(USERS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${deps.secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phone_number: [person.phone],
        ...(person.email !== null && { email_address: [person.email] }),
      }),
      signal: AbortSignal.timeout(ADMIT_TIMEOUT_MS),
    });
    if (response.ok) return { status: response.status, errors: [] };
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, errors: errorsOf(body) };
  };

  // Every error is "that address is taken", and nothing else is wrong.
  const onlyExists = (answer: Answer) =>
    answer.status === 422 &&
    answer.errors.length > 0 &&
    answer.errors.every((e) => e.code === EXISTS);

  const refused = (answer: Answer) =>
    new ClerkDirectoryError(
      answer.status,
      answer.errors.map((e) => e.code),
    );

  return {
    async admit(person) {
      const first = await create(person);
      if (first.status === 200) return;
      if (!onlyExists(first)) throw refused(first);
      // The number already has a login: admitted before.
      if (first.errors.some((e) => e.param === "phone_number")) return;
      // Only the email is held, by a user without this number: the number still needs its
      // login. Without an email this call differs from the first, so it cannot loop.
      if (person.email === null) throw refused(first);
      const second = await create({ email: null, phone: person.phone });
      if (second.status === 200 || onlyExists(second)) return;
      throw refused(second);
    },
  };
}
