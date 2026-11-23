// Clerk as the identity directory (packages/api identity.ts, IdentityDirectory): roster.invite
// admits a person by creating their Clerk user, since the instance is invitation-only and
// Clerk has no invitation by SMS. Clerk marks an address created this way as verified; the
// person still proves it is theirs, by the code sent to it at every sign-in.
//
// One documented call, Clerk's Backend API `POST /v1/users`, made with `fetch` so that its
// timeout and every answer it can give are stated here. What was read on the development
// instance (2026-11-12): a number alone is accepted; an address another user holds answers
// 422 `form_identifier_exists` naming that address. An email with no number answered 422
// `form_data_missing` while the instance required a number; it requires none since
// 2026-11-23 (`auth_phone.required_for_sign_up: false`), and a person invited by email alone
// is created by it.
//
// A login made here carries the roster row's id as Clerk's `external_id`: the row's login
// can then be found by what it is, never by an address that someone else may hold. A login
// that already existed is left exactly as it was, untagged: it may be another person's.
//
// "Already admitted" is success, and silent: a second invitation of the same number — a
// retry, another company's — must neither fail nor say that the number is known. The number
// is what must end up with a login, or the email for a person with no number; so when a
// person has both and only the email is held by an existing user, they are created by
// number alone.
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
    id: string;
    email: string | null;
    phone: string | null;
  }): Promise<Answer> => {
    const response = await deps.fetch(USERS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${deps.secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        external_id: person.id,
        ...(person.phone !== null && { phone_number: [person.phone] }),
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
      const held = (param: string) => first.errors.some((e) => e.param === param);
      if (person.phone === null) {
        // By email alone, and the email already has a login: admitted before.
        if (held("email_address")) return;
        throw refused(first);
      }
      // The number already has a login: admitted before.
      if (held("phone_number")) return;
      // Only the email is held, by a user without this number: the number still needs its
      // login. Without an email this call differs from the first, so it cannot loop.
      if (person.email === null || !held("email_address")) throw refused(first);
      const second = await create({ ...person, email: null });
      if (second.status === 200) return;
      if (onlyExists(second) && second.errors.some((e) => e.param === "phone_number")) {
        return;
      }
      throw refused(second);
    },
  };
}
