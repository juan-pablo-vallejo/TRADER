// TASKS, R2: Clerk behind the identity seam. A session here is a fake handed to the adapter
// in place of Clerk's `auth()`: what is tested is everything on this side of Clerk's own
// verification — which claims make an identity, that a session without an invitation binds
// nothing, and that a production build never consults the development identity.
import { users } from "@trader/db/schema";
import {
  DEV_EMAIL_HEADER,
  DEV_PHONE_HEADER,
  DEV_SUBJECT_HEADER,
  localDirectory,
} from "@trader/api";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as routeGET } from "../src/app/api/trpc/[trpc]/route";
import { GET as devSignInGET, POST as devSignInPOST } from "../src/app/dev-signin/route";
import { clerkEnv } from "../src/server/clerk-env";
import {
  createClerkIdentityAdapter,
  identityFromClaims,
  type ClerkSession,
} from "../src/server/clerk-identity";
import { getDb } from "../src/server/db";
import { createTrpcHandler } from "../src/server/handler";
import { DEV_EMAIL_COOKIE } from "../src/server/identity";
import { identityMode, signInPath } from "../src/server/identity-mode";
import { invitation, ownerDb, query, quietReporter } from "./helpers";

const owner = ownerDb();
let fixture: Awaited<ReturnType<typeof invitation>>;
let phone: string;

// A number no other run uses: a sign-in number is matched across every company.
const freshPhone = () =>
  `+1${String(2_000_000_000 + (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0))}`;

beforeEach(async () => {
  fixture = await invitation(owner);
  phone = freshPhone();
  await owner
    .update(users)
    .set({ signInPhone: phone })
    .where(eq(users.id, fixture.userId));
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await getDb().$client.end();
  await owner.$client.end();
});

const USER = "user_2aBcDeFgHiJkLmNoPqRsTuVwXyZ";
const OTHER = "user_2zYxWvUtSrQpOnMlKjIhGfEdCbA";

const session = (userId: string | null, sessionClaims: unknown): ClerkSession => ({
  userId,
  sessionClaims,
});

// The route handler on Clerk's adapter, the session a fake.
const handlerFor = (read: () => Promise<ClerkSession>, onError = () => {}) =>
  createTrpcHandler({
    getDb,
    identity: createClerkIdentityAdapter({ readSession: read, onError }),
    directory: localDirectory,
    reporter: quietReporter,
  });

const subjectOf = async (userId: string) => {
  const [row] = await owner
    .select({ identitySubject: users.identitySubject })
    .from(users)
    .where(eq(users.id, userId));
  return row?.identitySubject;
};

describe("identityFromClaims", () => {
  const full = {
    email: "Dana@Office.Test",
    email_verified: true,
    phone_number: "+14015550123",
    phone_number_verified: true,
  };

  it("takes each address only beside its own flag, the email in lower case", () => {
    expect(identityFromClaims(USER, full)).toEqual({
      subject: USER,
      email: "dana@office.test",
      emailVerified: true,
      phone: "+14015550123",
      phoneVerified: true,
    });
    expect(identityFromClaims(USER, { ...full, email_verified: false })).toEqual({
      subject: USER,
      phone: "+14015550123",
      phoneVerified: true,
    });
    expect(identityFromClaims(USER, { ...full, phone_number_verified: false })).toEqual({
      subject: USER,
      email: "dana@office.test",
      emailVerified: true,
    });
  });

  it("takes a flag only as the boolean true", () => {
    for (const flag of ["true", 1, "1", null, undefined, {}]) {
      expect(
        identityFromClaims(USER, {
          ...full,
          email_verified: flag,
          phone_number_verified: flag,
        }),
      ).toBeNull();
    }
  });

  it("drops a number that is not a +1 E.164 number, never reading it as one", () => {
    for (const number of ["+442071234567", "4015550123", "+1 401 555 0123", null, 0]) {
      expect(
        identityFromClaims(USER, { phone_number: number, phone_number_verified: true }),
      ).toBeNull();
      // The verified email still stands on its own.
      expect(identityFromClaims(USER, { ...full, phone_number: number })).toEqual({
        subject: USER,
        email: "dana@office.test",
        emailVerified: true,
      });
    }
  });

  it("is no identity without a Clerk user id, without claims, or with no verified address", () => {
    for (const id of [null, undefined, "", "dev:dana@office.test", "user_", 7]) {
      expect(identityFromClaims(id, full)).toBeNull();
    }
    for (const claims of [null, undefined, "claims", {}, { email: "dana@office.test" }]) {
      expect(identityFromClaims(USER, claims)).toBeNull();
    }
    expect(
      identityFromClaims(USER, { email: "not an email", email_verified: true }),
    ).toBeNull();
  });
});

describe("the Clerk adapter behind the route handler", () => {
  it("answers 401 to a request with no session", async () => {
    const handler = handlerFor(() => Promise.resolve(session(null, null)));
    const r = await query(handler, "me.get");
    expect(r.status).toBe(401);
    expect(r.body.error?.json.data.code).toBe("UNAUTHORIZED");
  });

  it("refuses a session whose number and email match no invitation, binding nothing", async () => {
    const handler = handlerFor(() =>
      Promise.resolve(
        session(USER, {
          email: `stranger-${fixture.run}@web.test`,
          email_verified: true,
          phone_number: freshPhone(),
          phone_number_verified: true,
        }),
      ),
    );
    const r = await query(handler, "me.get");
    expect(r.status).toBe(401);
    expect(await subjectOf(fixture.userId)).toBeNull();
    const bound = await owner
      .select({ id: users.id })
      .from(users)
      .where(eq(users.identitySubject, USER));
    expect(bound).toEqual([]);
  });

  it("refuses a session whose matching address is not verified, binding nothing", async () => {
    const handler = handlerFor(() =>
      Promise.resolve(
        session(USER, {
          email: fixture.email,
          email_verified: false,
          phone_number: phone,
          phone_number_verified: false,
        }),
      ),
    );
    expect((await query(handler, "me.get")).status).toBe(401);
    expect(await subjectOf(fixture.userId)).toBeNull();
  });

  it("binds the invitation its verified number names, once, to Clerk's user id", async () => {
    const claims = { phone_number: phone, phone_number_verified: true };
    const mine = handlerFor(() => Promise.resolve(session(USER, claims)));
    for (let i = 0; i < 2; i++) {
      const r = await query(mine, "me.get");
      expect(r.status).toBe(200);
      expect(r.body.result?.data.json).toMatchObject({
        id: fixture.userId,
        signInPhone: phone,
      });
    }
    expect(await subjectOf(fixture.userId)).toBe(USER);
    // A second Clerk user presenting the same number is nobody: the row is bound.
    const theirs = handlerFor(() => Promise.resolve(session(OTHER, claims)));
    expect((await query(theirs, "me.get")).status).toBe(401);
    expect(await subjectOf(fixture.userId)).toBe(USER);
  });

  it("answers no identity, reported once, when the session cannot be read", async () => {
    const errors: unknown[] = [];
    const handler = handlerFor(
      () => Promise.reject(new Error("no proxy ran")),
      (error?: unknown) => errors.push(error),
    );
    expect((await query(handler, "me.get")).status).toBe(401);
    expect(errors).toHaveLength(1);
    // What needs no identity still answers.
    const status = await query(handler, "status.get", {
      input: { protocolVersion: 1, platform: "ios", build: 1 },
    });
    expect(status.status).toBe(200);
  });
});

describe("the identity mode", () => {
  it("is the development identity only under its flag and a development NODE_ENV", () => {
    const mode = (
      NODE_ENV: string | undefined,
      TRADER_DEV_IDENTITY: string | undefined,
    ) => identityMode({ NODE_ENV, TRADER_DEV_IDENTITY });
    expect(mode("development", "enabled")).toBe("dev");
    expect(mode("test", "enabled")).toBe("dev");
    expect(mode("development", "")).toBe("clerk");
    expect(mode("test", undefined)).toBe("clerk");
    expect(mode("production", "enabled")).toBe("clerk");
    expect(mode("production", "")).toBe("clerk");
    expect(mode(undefined, "enabled")).toBe("clerk");
    expect(mode("staging", "enabled")).toBe("clerk");
    expect(mode("development", "yes")).toBe("clerk");
    expect(signInPath({ NODE_ENV: "test", TRADER_DEV_IDENTITY: "enabled" })).toBe(
      "/dev-signin",
    );
    expect(signInPath({ NODE_ENV: "production", TRADER_DEV_IDENTITY: "enabled" })).toBe(
      "/sign-in",
    );
  });

  it("never consults the development identity in a production build, flag on or not", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    // The development route is not there.
    expect((await devSignInGET()).status).toBe(404);
    const post = await devSignInPOST(
      new Request("http://test/dev-signin", {
        method: "POST",
        body: new URLSearchParams({ email: fixture.email }),
      }),
    );
    expect(post.status).toBe(404);
    // Neither its headers nor its cookie is an identity: refused, not a crash, nothing bound.
    const attempts: Record<string, string>[] = [
      { [DEV_SUBJECT_HEADER]: `dev:${fixture.email}`, [DEV_EMAIL_HEADER]: fixture.email },
      { [DEV_SUBJECT_HEADER]: `dev:${phone}`, [DEV_PHONE_HEADER]: phone },
      { cookie: `${DEV_EMAIL_COOKIE}=${encodeURIComponent(fixture.email)}` },
    ];
    for (const headers of attempts) {
      const r = await query(routeGET, "me.get", { headers });
      expect(r.status).toBe(401);
    }
    expect(await subjectOf(fixture.userId)).toBeNull();
  });
});

describe("clerkEnv", () => {
  const keys = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    CLERK_SECRET_KEY: "sk_test_abc",
  };

  it("needs both keys, each of its own kind", () => {
    expect(clerkEnv({})).toBeNull();
    expect(clerkEnv({ ...keys, CLERK_SECRET_KEY: "" })).toBeNull();
    expect(
      clerkEnv({ ...keys, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined }),
    ).toBeNull();
    expect(clerkEnv({ ...keys, CLERK_SECRET_KEY: "pk_test_abc" })).toBeNull();
    expect(clerkEnv(keys)).toEqual({
      publishableKey: "pk_test_abc",
      secretKey: "sk_test_abc",
      authorizedParties: [],
    });
  });

  it("reads the authorized origins, and is no configuration when one is not an origin", () => {
    expect(
      clerkEnv({
        ...keys,
        CLERK_AUTHORIZED_PARTIES: "http://localhost:3000, https://office.example",
      })?.authorizedParties,
    ).toEqual(["http://localhost:3000", "https://office.example"]);
    for (const bad of ["office.example", "https://office.example/path", "*"]) {
      expect(clerkEnv({ ...keys, CLERK_AUTHORIZED_PARTIES: bad })).toBeNull();
    }
  });
});
