// TASKS, R2: an invitation admits the person at Clerk. Clerk's API is a fake `fetch` here,
// answering what the development instance was seen to answer (clerk-directory.ts): what is
// tested is which call is made, which answers are an admission, and that nothing of the
// person is carried in a failure.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMIT_TIMEOUT_MS,
  ClerkDirectoryError,
  createClerkDirectory,
} from "../src/server/clerk-directory";
import { webDirectory } from "../src/server/directory";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const PHONE = "+14015550123";
const EMAIL = "dana@office.test";
const KEY = "sk_test_abc";

type Call = { url: string; init: RequestInit };

// A Clerk that answers each call in turn.
const clerk = (...answers: (Response | Error)[]) => {
  const calls: Call[] = [];
  const fake: typeof fetch = (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const answer = answers[calls.length - 1];
    if (answer === undefined) throw new Error("an unexpected call to Clerk");
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { calls, directory: createClerkDirectory({ secretKey: KEY, fetch: fake }) };
};

const created = () => Response.json({ id: "user_x" }, { status: 200 });
const refusal = (status: number, ...errors: [code: string, param?: string][]) =>
  Response.json(
    {
      errors: errors.map(([code, param]) => ({
        code,
        message: `about ${EMAIL} and ${PHONE}`,
        ...(param !== undefined && { meta: { param_name: param } }),
      })),
    },
    { status },
  );
const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init.body)) as unknown;

describe("the Clerk directory", () => {
  it("creates the user by number, and by number and email, under the secret key", async () => {
    const { calls, directory } = clerk(created(), created());
    await directory.admit({ email: null, phone: PHONE });
    await directory.admit({ email: EMAIL, phone: PHONE });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://api.clerk.com/v1/users");
    expect(calls[0]?.init.method).toBe("POST");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      `Bearer ${KEY}`,
    );
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(bodyOf(calls[0])).toEqual({ phone_number: [PHONE] });
    expect(bodyOf(calls[1])).toEqual({ phone_number: [PHONE], email_address: [EMAIL] });
    expect(ADMIT_TIMEOUT_MS).toBe(5000);
  });

  it("takes a number Clerk already holds as admitted, with no second call", async () => {
    for (const errors of [
      [["form_identifier_exists", "phone_number"]],
      [
        ["form_identifier_exists", "email_address"],
        ["form_identifier_exists", "phone_number"],
      ],
    ] as [string, string][][]) {
      const { calls, directory } = clerk(refusal(422, ...errors));
      await expect(
        directory.admit({ email: EMAIL, phone: PHONE }),
      ).resolves.toBeUndefined();
      expect(calls).toHaveLength(1);
    }
  });

  it("creates the user by number alone when only the email is already held", async () => {
    const taken = () => refusal(422, ["form_identifier_exists", "email_address"]);
    const first = clerk(taken(), created());
    await first.directory.admit({ email: EMAIL, phone: PHONE });
    expect(first.calls.map(bodyOf)).toEqual([
      { phone_number: [PHONE], email_address: [EMAIL] },
      { phone_number: [PHONE] },
    ]);
    // The number turned out to be held too, by the time of the second call: admitted.
    const raced = clerk(
      taken(),
      refusal(422, ["form_identifier_exists", "phone_number"]),
    );
    await expect(
      raced.directory.admit({ email: EMAIL, phone: PHONE }),
    ).resolves.toBeUndefined();
    // And a second call Clerk refuses outright invites no one.
    const broken = clerk(taken(), refusal(500));
    await expect(broken.directory.admit({ email: EMAIL, phone: PHONE })).rejects.toThrow(
      ClerkDirectoryError,
    );
  });

  it("fails on every other answer, carrying the status and codes and nothing of the person", async () => {
    for (const answer of [
      refusal(422, ["form_data_missing"]),
      refusal(
        422,
        ["form_identifier_exists", "phone_number"],
        ["form_param_format_invalid"],
      ),
      refusal(422),
      refusal(401, ["authentication_invalid"]),
      refusal(429, ["too_many_requests"]),
      refusal(500),
      new Response("not json", { status: 502 }),
    ]) {
      const { directory } = clerk(answer);
      const error = await directory
        .admit({ email: EMAIL, phone: PHONE })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ClerkDirectoryError);
      expect((error as ClerkDirectoryError).status).toBe(answer.status);
      const said = JSON.stringify([error, (error as Error).message]);
      expect(said).not.toContain(EMAIL);
      expect(said).not.toContain(PHONE);
      expect(said).not.toContain(KEY);
    }
    // A provider that never answers, or cannot be reached.
    const { directory } = clerk(new DOMException("timed out", "TimeoutError"));
    await expect(directory.admit({ email: null, phone: PHONE })).rejects.toThrow(
      "timed out",
    );
  });
});

describe("the web directory", () => {
  it("tells no provider under the development identity", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(
      webDirectory.admit({ email: EMAIL, phone: PHONE }),
    ).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses the invitation where Clerk is the identity and its keys are missing", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(webDirectory.admit({ email: EMAIL, phone: PHONE })).rejects.toThrow(
      "no identity provider is configured",
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls Clerk where Clerk is the identity, a production build with the flag on included", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_abc");
    vi.stubEnv("CLERK_SECRET_KEY", KEY);
    const spy = vi.fn(() => Promise.resolve(created()));
    vi.stubGlobal("fetch", spy);
    await webDirectory.admit({ email: null, phone: PHONE });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
