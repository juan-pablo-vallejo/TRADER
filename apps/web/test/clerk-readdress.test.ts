// An address change at Clerk (server/clerk-directory.ts, readdress). Clerk here is a small
// stand-in that keeps logins as Clerk does and answers the Backend API calls a change
// makes; what is tested is where a login ends up, which login was touched, that none is
// ever looked for by an address, and what is said when Clerk will not or cannot.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClerkDirectoryError,
  createClerkDirectory,
  READDRESS_TIMEOUT_MS,
} from "../src/server/clerk-directory";
import { webDirectory } from "../src/server/directory";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const KEY = "sk_test_abc";
const ROW = "0193a1b2-0000-7000-8000-000000000001";
const OLD_EMAIL = "old@crew.test";
const NEW_EMAIL = "new@crew.test";
const PHONE = "+14015550123";
const NEW_PHONE = "+14015550124";

type Login = {
  id: string;
  external_id: string | null;
  email_addresses: { id: string; email_address: string }[];
  phone_numbers: { id: string; phone_number: string }[];
  primary_email_address_id: string | null;
  primary_phone_number_id: string | null;
  passkeys: { id: string }[];
  external_accounts: { id: string }[];
  // Not on Clerk's user object: its sessions, read by their own call.
  sessions: { id: string; status: string }[];
};

const login = (id: string, over: Partial<Login> = {}): Login => ({
  id,
  external_id: null,
  email_addresses: [],
  phone_numbers: [],
  primary_email_address_id: null,
  primary_phone_number_id: null,
  passkeys: [],
  external_accounts: [],
  sessions: [],
  ...over,
});

type Call = { method: string; path: string; body: unknown; signal: unknown };

const exists = (param: string) =>
  Response.json(
    { errors: [{ code: "form_identifier_exists", meta: { param_name: param } }] },
    { status: 422 },
  );
const missing = () =>
  Response.json({ errors: [{ code: "resource_not_found" }] }, { status: 404 });

// Clerk, as far as a change asks it. `instead` answers a call in Clerk's place: a failure.
function clerk(
  logins: Login[],
  instead: (call: Call) => Response | Error | null = () => null,
) {
  const calls: Call[] = [];
  let made = 0;
  const kinds = {
    email_addresses: { value: "email_address", primary: "primary_email_address_id" },
    phone_numbers: { value: "phone_number", primary: "primary_phone_number_id" },
  } as const;
  const answer = (call: Call): Response => {
    const url = new URL(`https://clerk.test${call.path}`);
    const [, first, second, third, fourth] = url.pathname.split("/");
    const one = (id: string | undefined) => logins.find((l) => l.id === id);
    if (first === "users" && second === undefined && call.method === "GET") {
      const tag = url.searchParams.get("external_id");
      return Response.json(logins.filter((l) => l.external_id === tag));
    }
    if (first === "users" && third === undefined && call.method === "GET") {
      const found = one(second);
      return found === undefined ? missing() : Response.json(found);
    }
    if (first === "users" && call.method === "DELETE") {
      const found = one(second);
      if (found === undefined) return missing();
      if (third === "passkeys" || third === "external_accounts") {
        found[third] = found[third].filter((x) => x.id !== fourth);
        return Response.json({ deleted: true });
      }
    }
    if (first === "email_addresses" || first === "phone_numbers") {
      const kind = kinds[first];
      const list = (l: Login) => l[first] as unknown as Record<string, string>[];
      if (call.method === "POST") {
        const body = call.body as Record<string, string | boolean>;
        const value = String(body[kind.value]);
        const taken = logins.some((l) =>
          list(l).some((x) => x[kind.value]?.toLowerCase() === value.toLowerCase()),
        );
        if (taken) return exists(kind.value);
        const owner = one(String(body.user_id));
        if (owner === undefined) return missing();
        const id = `idn_${String((made += 1))}`;
        list(owner).push({ id, [kind.value]: value });
        if (body.primary === true) owner[kind.primary] = id;
        return Response.json({ id });
      }
      const owner = logins.find((l) => list(l).some((x) => x.id === second));
      if (owner === undefined) return missing();
      if (call.method === "PATCH") {
        owner[kind.primary] = second ?? null;
        return Response.json({ id: second });
      }
      if (call.method === "DELETE") {
        const left = owner.email_addresses.length + owner.phone_numbers.length;
        // Clerk keeps one identifier on every login.
        if (left === 1) {
          return Response.json(
            { errors: [{ code: "identification_deletion_failed" }] },
            { status: 422 },
          );
        }
        (owner[first] as unknown) = list(owner).filter((x) => x.id !== second);
        if (owner[kind.primary] === second) owner[kind.primary] = null;
        return Response.json({ deleted: true });
      }
    }
    if (first === "sessions" && second === undefined && call.method === "GET") {
      const of = one(url.searchParams.get("user_id") ?? "");
      const status = url.searchParams.get("status");
      return Response.json((of?.sessions ?? []).filter((s) => s.status === status));
    }
    if (first === "sessions" && third === "revoke" && call.method === "POST") {
      for (const l of logins) {
        for (const s of l.sessions) if (s.id === second) s.status = "revoked";
      }
      return Response.json({ id: second });
    }
    throw new Error(`a call Clerk was not expected to get: ${call.method} ${call.path}`);
  };
  const fake: typeof fetch = (url, init) => {
    const call: Call = {
      method: init?.method ?? "GET",
      path: String(url).replace("https://api.clerk.com/v1", ""),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      signal: init?.signal,
    };
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    calls.push(call);
    // As fetch does: a call on a signal already aborted fails at once.
    if ((init?.signal as AbortSignal | undefined)?.aborted === true) {
      return Promise.reject(new DOMException("aborted", "AbortError"));
    }
    const other = instead(call);
    if (other instanceof Error) return Promise.reject(other);
    return Promise.resolve(other ?? answer(call));
  };
  return {
    calls,
    logins,
    directory: createClerkDirectory({ secretKey: KEY, fetch: fake }),
  };
}

// What a login can be signed in to with, and what could sign in as it.
const stateOf = (l: Login) => ({
  emails: l.email_addresses.map((e) => e.email_address),
  phones: l.phone_numbers.map((p) => p.phone_number),
  primaryEmail:
    l.email_addresses.find((e) => e.id === l.primary_email_address_id)?.email_address ??
    null,
  primaryPhone:
    l.phone_numbers.find((p) => p.id === l.primary_phone_number_id)?.phone_number ?? null,
  passkeys: l.passkeys.length,
  linked: l.external_accounts.length,
  signedIn: l.sessions.filter((s) => s.status === "active").length,
});

// A person who has signed in: both addresses, a passkey, a Google link, two sessions.
const signedIn = () =>
  login("user_bound", {
    external_id: ROW,
    email_addresses: [{ id: "idn_e", email_address: OLD_EMAIL }],
    phone_numbers: [{ id: "idn_p", phone_number: PHONE }],
    primary_email_address_id: "idn_e",
    primary_phone_number_id: "idn_p",
    passkeys: [{ id: "idn_k" }],
    external_accounts: [{ id: "eac_g" }],
    sessions: [
      { id: "sess_1", status: "active" },
      { id: "sess_2", status: "active" },
      { id: "sess_old", status: "ended" },
    ],
  });

// No call finds anybody by an address: a login is read by its id or by the row's tag.
const namesNoAddress = (calls: Call[]) => {
  for (const call of calls.filter((c) => c.method === "GET")) {
    expect(call.path).toMatch(
      /^\/users\/user_[a-z_]+$|^\/users\?external_id=[0-9a-f-]+&limit=2$|^\/sessions\?user_id=user_[a-z_]+&status=active&limit=100$/,
    );
  }
  expect(calls.map((c) => c.path).join(" ")).not.toMatch(/@|%40|%2B1|\+1\d/);
};

describe("an address change at Clerk", () => {
  it("leaves the bound login with exactly the row's addresses, and nothing that could sign in as it", async () => {
    const c = clerk([signedIn()]);
    expect(
      await c.directory.readdress({
        id: ROW,
        subject: "user_bound",
        email: NEW_EMAIL,
        phone: PHONE,
        fresh: true,
      }),
    ).toBe("done");
    expect(stateOf(c.logins[0]!)).toEqual({
      emails: [NEW_EMAIL],
      phones: [PHONE],
      primaryEmail: NEW_EMAIL,
      primaryPhone: PHONE,
      passkeys: 0,
      linked: 0,
      signedIn: 0,
    });
    // The new address went on, verified and primary, before anything came off.
    const writes = c.calls.filter((call) => call.method !== "GET");
    expect(writes[0]).toMatchObject({
      method: "POST",
      path: "/email_addresses",
      body: {
        user_id: "user_bound",
        email_address: NEW_EMAIL,
        verified: true,
        primary: true,
      },
    });
    expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      "POST /email_addresses",
      "DELETE /users/user_bound/external_accounts/eac_g",
      "DELETE /users/user_bound/passkeys/idn_k",
      "DELETE /email_addresses/idn_e",
      "POST /sessions/sess_1/revoke",
      "POST /sessions/sess_2/revoke",
    ]);
    namesNoAddress(c.calls);
    // One deadline for the whole change.
    expect(READDRESS_TIMEOUT_MS).toBe(5000);
    expect(c.calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(new Set(c.calls.map((call) => call.signal)).size).toBe(1);
  });

  it("finds the login of a person who has not signed in by the row's tag, gives it a number, then takes its email", async () => {
    const invited = login("user_tagged", {
      external_id: ROW,
      email_addresses: [{ id: "idn_e", email_address: OLD_EMAIL }],
      primary_email_address_id: "idn_e",
    });
    const c = clerk([login("user_other", { external_id: "another-row" }), invited]);
    const person = { id: ROW, subject: null, fresh: true };
    expect(
      await c.directory.readdress({ ...person, email: OLD_EMAIL, phone: NEW_PHONE }),
    ).toBe("done");
    expect(stateOf(invited)).toMatchObject({
      emails: [OLD_EMAIL],
      phones: [NEW_PHONE],
      primaryPhone: NEW_PHONE,
    });
    expect(
      await c.directory.readdress({ ...person, email: null, phone: NEW_PHONE }),
    ).toBe("done");
    expect(stateOf(invited)).toMatchObject({ emails: [], phones: [NEW_PHONE] });
    expect(c.calls[0]).toMatchObject({
      method: "GET",
      path: `/users?external_id=${ROW}&limit=2`,
    });
    namesNoAddress(c.calls);
  });

  it("touches nothing when the login already holds exactly these, unless the person's row itself changed", async () => {
    const same = {
      id: ROW,
      subject: "user_bound",
      email: OLD_EMAIL.toUpperCase(),
      phone: PHONE,
    };
    const c = clerk([signedIn()]);
    const before = stateOf(c.logins[0]!);
    expect(await c.directory.readdress({ ...same, fresh: false })).toBe("unchanged");
    expect(c.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /users/user_bound",
    ]);
    expect(stateOf(c.logins[0]!)).toEqual(before);
    // A change that stopped after the addresses and before the sign-out is finished by
    // being made again: the addresses are right already, and the rest is still done.
    expect(await c.directory.readdress({ ...same, fresh: true })).toBe("done");
    expect(stateOf(c.logins[0]!)).toEqual({
      ...before,
      passkeys: 0,
      linked: 0,
      signedIn: 0,
    });
  });

  it("finishes a change that stopped half-way: the address the person's row no longer holds comes off", async () => {
    const half = signedIn();
    half.email_addresses.push({ id: "idn_n", email_address: NEW_EMAIL });
    const c = clerk([half]);
    expect(
      await c.directory.readdress({
        id: ROW,
        subject: "user_bound",
        email: NEW_EMAIL,
        phone: PHONE,
        fresh: false,
      }),
    ).toBe("done");
    expect(stateOf(half)).toMatchObject({
      emails: [NEW_EMAIL],
      primaryEmail: NEW_EMAIL,
      signedIn: 0,
    });
    // It was there, so it is made primary and not added again.
    expect(c.calls.filter((call) => call.method === "PATCH")).toMatchObject([
      { path: "/email_addresses/idn_n", body: { verified: true, primary: true } },
    ]);
  });

  it("says an address another login holds is held, with neither login changed", async () => {
    const theirs = login("user_theirs", {
      email_addresses: [{ id: "idn_t", email_address: NEW_EMAIL }],
      primary_email_address_id: "idn_t",
      sessions: [{ id: "sess_t", status: "active" }],
    });
    const c = clerk([signedIn(), theirs]);
    const before = c.logins.map(stateOf);
    expect(
      await c.directory.readdress({
        id: ROW,
        subject: "user_bound",
        email: NEW_EMAIL,
        phone: PHONE,
        fresh: true,
      }),
    ).toBe("held");
    expect(c.logins.map(stateOf)).toEqual(before);
    expect(c.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /users/user_bound",
      "POST /email_addresses",
    ]);
  });

  it("never touches a login it cannot call the row's: another person on the old address, or none at all", async () => {
    // The row was invited with a number another company's person already had a login for.
    // That login is not tagged with this row, and is nobody's to change from here.
    const theirs = login("user_theirs", {
      external_id: "their-own-row",
      phone_numbers: [{ id: "idn_t", phone_number: PHONE }],
      primary_phone_number_id: "idn_t",
      sessions: [{ id: "sess_t", status: "active" }],
    });
    const untagged = login("user_untagged", {
      email_addresses: [{ id: "idn_u", email_address: OLD_EMAIL }],
      primary_email_address_id: "idn_u",
    });
    const c = clerk([theirs, untagged]);
    const before = c.logins.map(stateOf);
    expect(
      await c.directory.readdress({
        id: ROW,
        subject: null,
        email: OLD_EMAIL,
        phone: NEW_PHONE,
        fresh: true,
      }),
    ).toBe("no_login");
    // A row bound to a login Clerk no longer has.
    expect(
      await c.directory.readdress({
        id: ROW,
        subject: "user_gone",
        email: null,
        phone: NEW_PHONE,
        fresh: true,
      }),
    ).toBe("no_login");
    expect(c.logins.map(stateOf)).toEqual(before);
    expect(c.calls.every((call) => call.method === "GET")).toBe(true);
    namesNoAddress(c.calls);
  });

  // The failure: a change that stops after adding an address leaves the login holding a
  // verified address its person's row does not, which a first sign-in could then bind elsewhere.
  it("takes an address it added back off, and restores the primary, when a later step fails", async () => {
    const theirs = login("user_theirs", {
      phone_numbers: [{ id: "idn_t", phone_number: NEW_PHONE }],
      primary_phone_number_id: "idn_t",
    });
    const held = clerk([signedIn(), theirs]);
    const before = held.logins.map(stateOf);
    expect(
      await held.directory.readdress({
        id: ROW,
        subject: "user_bound",
        email: NEW_EMAIL,
        phone: NEW_PHONE,
        fresh: true,
      }),
    ).toBe("held");
    expect(held.logins.map(stateOf)).toEqual(before);

    const failing = clerk([signedIn()], (call) =>
      call.method === "POST" && call.path === "/phone_numbers"
        ? Response.json({ errors: [{ code: "upstream" }] }, { status: 500 })
        : null,
    );
    const was = failing.logins.map(stateOf);
    await expect(
      failing.directory.readdress({
        id: ROW,
        subject: "user_bound",
        email: NEW_EMAIL,
        phone: NEW_PHONE,
        fresh: true,
      }),
    ).rejects.toBeInstanceOf(ClerkDirectoryError);
    expect(failing.logins.map(stateOf)).toEqual(was);
  });

  // A change that ran out of time has no time left on its signal: the undo takes its own.
  it("takes an added address back off when a later step times out", async () => {
    let failed: AbortSignal | undefined;
    const slow = clerk([signedIn()], (call) => {
      if (call.method !== "POST" || call.path !== "/phone_numbers") return null;
      failed = call.signal as AbortSignal;
      return new DOMException("timed out", "TimeoutError");
    });
    const was = slow.logins.map(stateOf);
    await expect(
      slow.directory.readdress({
        id: ROW,
        subject: "user_bound",
        email: NEW_EMAIL,
        phone: NEW_PHONE,
        fresh: true,
      }),
    ).rejects.toThrow("timed out");
    expect(slow.logins.map(stateOf)).toEqual(was);
    const undone = slow.calls.slice(
      slow.calls.map((c) => c.signal).lastIndexOf(failed) + 1,
    );
    expect(undone.map((c) => c.method)).toEqual(["PATCH", "DELETE"]);
    for (const c of undone) expect(c.signal).not.toBe(failed);
  });

  it("fails when Clerk will not or cannot, carrying the status and codes and nothing of the person", async () => {
    for (const [failing, status] of [
      [(call: Call) => call.method === "GET", 500],
      [(call: Call) => call.method === "POST" && call.path === "/email_addresses", 429],
      [(call: Call) => call.method === "DELETE", 500],
      [(call: Call) => call.path.endsWith("/revoke"), 502],
    ] as const) {
      const c = clerk([signedIn()], (call) =>
        failing(call)
          ? Response.json(
              { errors: [{ code: "upstream", message: `about ${OLD_EMAIL} ${PHONE}` }] },
              { status },
            )
          : null,
      );
      const error = await c.directory
        .readdress({
          id: ROW,
          subject: "user_bound",
          email: NEW_EMAIL,
          phone: PHONE,
          fresh: true,
        })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ClerkDirectoryError);
      expect((error as ClerkDirectoryError).status).toBe(status);
      const said = JSON.stringify([error, (error as Error).message]);
      for (const secret of [OLD_EMAIL, NEW_EMAIL, PHONE, KEY]) {
        expect(said).not.toContain(secret);
      }
    }
    // A provider that answers too late, at any step.
    const late = clerk([signedIn()], (call) =>
      call.method === "DELETE" ? new DOMException("timed out", "TimeoutError") : null,
    );
    await expect(
      late.directory.readdress({
        id: ROW,
        subject: "user_bound",
        email: NEW_EMAIL,
        phone: PHONE,
        fresh: true,
      }),
    ).rejects.toThrow("timed out");
  });
});

describe("the web directory, for an address change", () => {
  const person = { id: ROW, subject: null, email: NEW_EMAIL, phone: null, fresh: true };

  it("tells no provider under the development identity", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(webDirectory.readdress(person)).resolves.toBe("unchanged");
    expect(spy).not.toHaveBeenCalled();
  });

  it("changes nobody's where Clerk is the identity and its keys are missing", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(webDirectory.readdress(person)).rejects.toThrow(
      "no identity provider is configured",
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
