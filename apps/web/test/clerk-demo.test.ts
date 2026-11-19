// The Demo sign-in's door at Clerk. Clerk's API is a fake `fetch` here: what is tested is
// which two calls are made and with what, that a ticket is given only for the one user who
// holds the number, that nothing of a person is carried in a failure, and when a
// deployment has a door at all.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClerkDemoError,
  createClerkDemoDoor,
  demoEnv,
  demoEnvFaults,
  TICKET_SECONDS,
  webDemo,
} from "../src/server/clerk-demo";
import { deployEnvFaults } from "../src/server/deploy-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

const PHONE = "+14015550123";
const KEY = "sk_test_abc";
const CODE = "a-long-demo-code-0123456789";
const COMPANY = "0193a5b0-0000-7000-8000-000000000001";
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz0123456789";

type Call = { url: string; init: RequestInit };

const clerk = (...answers: (Response | Error)[]) => {
  const calls: Call[] = [];
  const fake: typeof fetch = (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const answer = answers[calls.length - 1];
    if (answer === undefined) throw new Error("an unexpected call to Clerk");
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const door = createClerkDemoDoor({
    code: CODE,
    companyId: COMPANY,
    secretKey: KEY,
    fetch: fake,
  });
  return { calls, door };
};

const user = (id: string, ...numbers: string[]) => ({
  id,
  phone_numbers: numbers.map((phone_number) => ({ phone_number })),
});
const users = (...list: unknown[]) => Response.json(list, { status: 200 });
const token = () => Response.json({ token: TOKEN }, { status: 200 });

describe("the Demo door at Clerk", () => {
  it("finds the one user who holds the number and asks a single-use token for them", async () => {
    const c = clerk(users(user("user_abc", PHONE)), token());
    expect(await c.door.ticket(PHONE)).toBe(TOKEN);
    expect(c.calls).toHaveLength(2);
    const [list, make] = c.calls;
    expect(list!.url).toBe(
      "https://api.clerk.com/v1/users?phone_number=%2B14015550123&limit=10",
    );
    expect(list!.init.method).toBe("GET");
    expect(make!.url).toBe("https://api.clerk.com/v1/sign_in_tokens");
    expect(JSON.parse(String(make!.init.body))).toEqual({
      user_id: "user_abc",
      expires_in_seconds: TICKET_SECONDS,
    });
    for (const call of c.calls) {
      expect(call.init.headers).toMatchObject({ authorization: `Bearer ${KEY}` });
      // The key never follows a redirect to another host.
      expect(call.init.redirect).toBe("error");
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
    }
    // Good for a minute: the phone redeems it at once.
    expect(TICKET_SECONDS).toBe(60);
  });

  it("gives no ticket, and asks for none, unless exactly one user holds that number", async () => {
    const cases: unknown[][] = [
      [],
      // A filter Clerk ignored must not hand back somebody else.
      [user("user_other", "+14015550199")],
      [user("user_a", PHONE), user("user_b", PHONE)],
      [user("not a clerk id", PHONE)],
      [{ id: "user_abc" }],
    ];
    for (const list of cases) {
      const c = clerk(users(...list));
      expect(await c.door.ticket(PHONE)).toBeNull();
      expect(c.calls).toHaveLength(1);
    }
    const unreadable = clerk(Response.json({ data: "x" }, { status: 200 }));
    expect(await unreadable.door.ticket(PHONE)).toBeNull();
    const noToken = clerk(users(user("user_abc", PHONE)), Response.json({}));
    expect(await noToken.door.ticket(PHONE)).toBeNull();
  });

  it("fails on a refusal with the call and the status, and nothing of the person", async () => {
    const refused = (status: number) =>
      Response.json({ errors: [{ message: `about ${PHONE}` }] }, { status });
    const first = clerk(refused(401));
    const error = await first.door.ticket(PHONE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClerkDemoError);
    expect(error).toMatchObject({ call: "users", status: 401 });
    expect(String((error as Error).message)).not.toContain(PHONE);
    const second = clerk(users(user("user_abc", PHONE)), refused(422));
    expect(await second.door.ticket(PHONE).catch((e: unknown) => e)).toMatchObject({
      call: "sign_in_tokens",
      status: 422,
    });
    const down = clerk(new Error("network"));
    await expect(down.door.ticket(PHONE)).rejects.toThrow("network");
  });
});

describe("the Demo pair in the environment", () => {
  const pair = { DEMO_SIGN_IN_CODE: CODE, DEMO_COMPANY_ID: COMPANY };

  it("is a door when both are set and well formed, and no door when both are blank", () => {
    expect(demoEnvFaults(pair)).toEqual([]);
    expect(demoEnv(pair)).toEqual({ code: CODE, companyId: COMPANY });
    for (const none of [{}, { DEMO_SIGN_IN_CODE: " ", DEMO_COMPANY_ID: "" }]) {
      expect(demoEnvFaults(none)).toEqual([]);
      expect(demoEnv(none)).toBeNull();
    }
  });

  it("names the half that is missing or malformed, and is then no door", () => {
    const cases: [Record<string, string>, string[]][] = [
      [{ DEMO_SIGN_IN_CODE: CODE }, ["DEMO_COMPANY_ID"]],
      [{ DEMO_COMPANY_ID: COMPANY }, ["DEMO_SIGN_IN_CODE"]],
      // Too short to be worth guarding anything, or with a space in it.
      [{ ...pair, DEMO_SIGN_IN_CODE: "short" }, ["DEMO_SIGN_IN_CODE"]],
      [
        { ...pair, DEMO_SIGN_IN_CODE: "sixteen characters and spaces" },
        ["DEMO_SIGN_IN_CODE"],
      ],
      [{ ...pair, DEMO_COMPANY_ID: "Demo" }, ["DEMO_COMPANY_ID"]],
    ];
    for (const [env, faults] of cases) {
      expect(demoEnvFaults(env)).toEqual(faults);
      expect(demoEnv(env)).toBeNull();
      // A deployment refuses to start on it, by name.
      expect(deployEnvFaults(env)).toEqual(expect.arrayContaining(faults));
    }
  });

  it("opens on a host only with the pair and Clerk's keys", () => {
    expect(webDemo()).toBeNull();
    vi.stubEnv("DEMO_SIGN_IN_CODE", CODE);
    vi.stubEnv("DEMO_COMPANY_ID", COMPANY);
    // No Clerk: nobody to ask for a ticket.
    expect(webDemo()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_abc");
    vi.stubEnv("CLERK_SECRET_KEY", KEY);
    expect(webDemo()).toMatchObject({ code: CODE, companyId: COMPANY });
  });
});
