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
// `readdress` brings one row's login to the addresses the roster now holds (packages/api,
// roster/address.ts). The login is read by its own id, the one bound to the row, or found
// by the row's tag: no call here ever names an address to find anyone by. A new address
// goes on first, verified and primary, and Clerk's "another user has it" is the answer
// `held` with nothing yet changed; then links to other accounts and passkeys come off,
// then the addresses the roster no longer holds, then every session is revoked. Each step
// is one documented Backend API call (paths read from @clerk/backend 3.27.0, 2026-11-23),
// all under one deadline, and done again from the top they finish what was left. What is
// not removed here: a Face ID or fingerprint key from the phone app, for which the Backend
// API of that version has no call.
//
// Nothing of a response is kept or thrown: it names the person. An error carries the HTTP
// status and Clerk's error codes, no more.
import type { IdentityDirectory, Readdressed } from "@trader/api";

const API = "https://api.clerk.com/v1";
const USERS_URL = `${API}/users`;

// roster.invite waits on this inside its transaction (roster/invite.ts): bounded, so a
// stalled provider costs one admin a failed invitation and never a held connection.
export const ADMIT_TIMEOUT_MS = 5_000;

// roster.setEmail and roster.setSignInPhone wait on this inside their transaction, with the
// person's row locked: one deadline for every call a change makes, not one each.
export const READDRESS_TIMEOUT_MS = 5_000;
// What putting a failed change back may take, after it (H6).
const UNDO_TIMEOUT_MS = 3_000;

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

  // One call of a change, under the change's own deadline. A body that cannot be read is
  // no body: only the status and the error codes are ever looked at.
  const call = async (
    signal: AbortSignal,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Answer & { body: unknown }> => {
    const response = await deps.fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${deps.secretKey}`,
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal,
    });
    const read: unknown = await response.json().catch(() => null);
    return {
      status: response.status,
      errors: response.ok ? [] : errorsOf(read),
      body: response.ok ? read : null,
    };
  };

  const done = (answer: Answer) => {
    if (answer.status < 200 || answer.status > 299) throw refused(answer);
  };

  // The ids of what a login holds, as Clerk's user object lists them.
  type Held = { id: string; value: string };
  const listOf = (user: unknown, key: string, field: string | null): Held[] => {
    const list = (user as Record<string, unknown> | null)?.[key];
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
      const id = (item as { id?: unknown } | null)?.id;
      const value = field === null ? "" : (item as Record<string, unknown>)[field];
      return typeof id === "string" && typeof value === "string" ? [{ id, value }] : [];
    });
  };
  const segment = (id: string) => encodeURIComponent(id);

  // The row's login: the one bound to it, else the one tagged with it. Never by address.
  const loginOf = async (
    signal: AbortSignal,
    person: { id: string; subject: string | null },
  ): Promise<{ id: string; user: unknown } | null> => {
    if (person.subject !== null) {
      const answer = await call(signal, "GET", `/users/${segment(person.subject)}`);
      if (answer.status === 404) return null;
      done(answer);
      return { id: person.subject, user: answer.body };
    }
    const answer = await call(
      signal,
      "GET",
      `/users?external_id=${segment(person.id)}&limit=2`,
    );
    done(answer);
    const found = Array.isArray(answer.body) ? (answer.body as unknown[]) : [];
    const tagged = found.filter(
      (user) => (user as { external_id?: unknown } | null)?.external_id === person.id,
    );
    const [only] = tagged;
    const id = (only as { id?: unknown } | undefined)?.id;
    // Clerk keeps a tag to one login. Two would be two people: neither is touched.
    return tagged.length === 1 && typeof id === "string" ? { id, user: only } : null;
  };

  const readdress = async (
    person: Parameters<IdentityDirectory["readdress"]>[0],
  ): Promise<Readdressed> => {
    const signal = AbortSignal.timeout(READDRESS_TIMEOUT_MS);
    const login = await loginOf(signal, person);
    if (login === null) return "no_login";
    const primary = login.user as {
      primary_email_address_id?: unknown;
      primary_phone_number_id?: unknown;
    } | null;
    const kinds = [
      {
        path: "/email_addresses",
        field: "email_address",
        want: person.email,
        have: listOf(login.user, "email_addresses", "email_address"),
        primaryId: primary?.primary_email_address_id,
        // Clerk compares an email without regard to case, as the roster does.
        same: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
      },
      {
        path: "/phone_numbers",
        field: "phone_number",
        want: person.phone,
        have: listOf(login.user, "phone_numbers", "phone_number"),
        primaryId: primary?.primary_phone_number_id,
        same: (a: string, b: string) => a === b,
      },
    ];
    let changed = false;
    // What this change added, and each primary it moved, so that a step failing before the
    // old addresses come off puts the login back as it was (H6): an added, verified address
    // its roster row does not hold could be bound to another company's invitation.
    const added: string[] = [];
    const moved: { path: string; id: string }[] = [];
    // Its own deadline: a change that failed by running out of time has no time left on its
    // signal, and an undo under it would fail at once.
    const undo = async () => {
      const signal = AbortSignal.timeout(UNDO_TIMEOUT_MS);
      try {
        for (const m of moved) {
          done(
            await call(signal, "PATCH", `${m.path}/${segment(m.id)}`, { primary: true }),
          );
        }
        for (const path of added) done(await call(signal, "DELETE", path));
      } catch {
        // The change's own failure is the one answered; a retry finishes it (stale, below).
      }
    };
    // First what is added, so that "another login has it" is said with nothing changed,
    // and so that the login never stands without an address.
    try {
      for (const kind of kinds) {
        const { want } = kind;
        if (want === null) continue;
        const held = kind.have.find((h) => kind.same(h.value, want));
        const was = typeof kind.primaryId === "string" ? kind.primaryId : null;
        if (held === undefined) {
          const answer = await call(signal, "POST", kind.path, {
            user_id: login.id,
            [kind.field]: want,
            verified: true,
            primary: true,
          });
          if (onlyExists(answer)) {
            await undo();
            return "held";
          }
          done(answer);
          const id = (answer.body as { id?: unknown } | null)?.id;
          if (typeof id === "string") added.push(`${kind.path}/${segment(id)}`);
          if (was !== null) moved.push({ path: kind.path, id: was });
          changed = true;
        } else if (held.id !== kind.primaryId) {
          done(
            await call(signal, "PATCH", `${kind.path}/${segment(held.id)}`, {
              verified: true,
              primary: true,
            }),
          );
          if (was !== null) moved.push({ path: kind.path, id: was });
          changed = true;
        }
      }
    } catch (error) {
      await undo();
      throw error;
    }
    const stale = kinds.flatMap((kind) =>
      kind.have
        .filter((h) => kind.want === null || !kind.same(h.value, kind.want))
        .map((h) => `${kind.path}/${segment(h.id)}`),
    );
    if (stale.length === 0 && !changed && !person.fresh) return "unchanged";
    // Whatever else could sign in as the person, before the addresses it may rest on go.
    const user = `/users/${segment(login.id)}`;
    for (const account of listOf(login.user, "external_accounts", null)) {
      done(
        await call(signal, "DELETE", `${user}/external_accounts/${segment(account.id)}`),
      );
    }
    for (const passkey of listOf(login.user, "passkeys", null)) {
      done(await call(signal, "DELETE", `${user}/passkeys/${segment(passkey.id)}`));
    }
    for (const path of stale) done(await call(signal, "DELETE", path));
    // Last: nobody is left signed in under what the login was.
    const sessions = await call(
      signal,
      "GET",
      `/sessions?user_id=${segment(login.id)}&status=active&limit=100`,
    );
    done(sessions);
    for (const session of listOf({ sessions: sessions.body }, "sessions", null)) {
      done(await call(signal, "POST", `/sessions/${segment(session.id)}/revoke`));
    }
    return "done";
  };

  return {
    readdress,
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
