// What stands in front of the API route (server/edge.ts, server/handler.ts; TASKS, edge
// protection for a public host): the body limit, the `Origin` check, the limit per address
// and the limit per signed-in identity, each refusing before a call runs; and a limiter
// that fails, which refuses nobody. The limiter here is a counter in memory: the real one
// is tested against Postgres (api core/rate-limit.test.ts), and once through the route.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER, localDirectory } from "@trader/api";
import type { RateLimit } from "@trader/api";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import {
  ADDRESS_LIMIT,
  addressOf,
  guardRequest,
  IDENTITY_LIMIT,
  MAX_BODY_BYTES,
  originsFrom,
  type EdgeDependencies,
} from "../src/server/edge";
import { createTrpcHandler, ENDPOINT } from "../src/server/handler";
import { webIdentity } from "../src/server/identity";
import { invitation, ownerDb, quietReporter, unusableDb } from "./helpers";

const owner = ownerDb();
afterAll(async () => {
  await getDb().$client.end();
  await owner.$client.end();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const HOST = "https://office.example";

// A limiter that counts in memory and remembers what it was asked.
function counting(over: Partial<EdgeDependencies> = {}) {
  const hits = new Map<string, number>();
  const failures: unknown[] = [];
  const deps: EdgeDependencies = {
    limiter: (rule: RateLimit, value: string) => {
      const key = `${rule.scope}:${value}`;
      const count = (hits.get(key) ?? 0) + 1;
      hits.set(key, count);
      return Promise.resolve({ limited: count > rule.limit, retryAfterSeconds: 42 });
    },
    authorizedOrigins: () => ["https://staging.example"],
    onLimiterFailure: (error) => failures.push(error),
    ...over,
  };
  return { deps, hits, failures };
}

const post = (headers: Record<string, string> = {}, body = "{}") =>
  new Request(`${HOST}${ENDPOINT}/me.update`, {
    method: "POST",
    headers: { "content-length": String(body.length), ...headers },
    body,
  });
const get = (headers: Record<string, string> = {}) =>
  new Request(`${HOST}${ENDPOINT}/status.get`, { headers });

describe("guardRequest", () => {
  it("refuses a body over the limit, of unstated length or of malformed length", async () => {
    const { deps } = counting();
    const statuses = [];
    for (const length of [String(MAX_BODY_BYTES + 1), "1e9", "-5"]) {
      statuses.push(
        (await guardRequest(post({ "content-length": length }), deps))?.status,
      );
    }
    expect(statuses).toEqual([413, 400, 400]);
    const unstated = new Request(`${HOST}${ENDPOINT}/me.update`, { method: "POST" });
    expect((await guardRequest(unstated, deps))?.status).toBe(411);
    // At the limit, and a GET with no body at all, go on.
    expect(
      await guardRequest(post({ "content-length": String(MAX_BODY_BYTES) }), deps),
    ).toBeNull();
    expect(await guardRequest(get(), deps)).toBeNull();
  });

  it("refuses a state-changing request from another site's origin, and no other", async () => {
    const { deps } = counting();
    const from = async (origin: string | null, method = "POST") => {
      const headers: Record<string, string> = origin === null ? {} : { origin };
      const req = method === "POST" ? post(headers) : get(headers);
      return (await guardRequest(req, deps))?.status ?? "on";
    };
    expect(await from("https://evil.example")).toBe(403);
    expect(await from("null")).toBe(403);
    expect(await from("https://office.example.evil.example")).toBe(403);
    // This deployment's own origin, one it authorizes, and no origin at all: the phone.
    expect(await from(HOST)).toBe("on");
    expect(await from("https://staging.example")).toBe("on");
    expect(await from(null)).toBe("on");
    // A read changes nothing: a foreign origin learns only what the browser lets it.
    expect(await from("https://evil.example", "GET")).toBe("on");
  });

  it("limits each address on its own and says how long to wait", async () => {
    const { deps, hits } = counting();
    const from = (address: string) =>
      guardRequest(get({ "x-forwarded-for": address }), deps);
    for (let i = 0; i < ADDRESS_LIMIT.limit; i++)
      expect(await from("198.51.100.7")).toBeNull();
    const refused = await from("198.51.100.7");
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get("retry-after")).toBe("42");
    expect(refused?.headers.get("cache-control")).toBe("no-store");
    expect(await from("198.51.100.8")).toBeNull();
    // With no address from the platform — a local request — nothing is counted.
    await guardRequest(get(), deps);
    expect([...hits.keys()].sort()).toEqual([
      "address:198.51.100.7",
      "address:198.51.100.8",
    ]);
  });

  it("reads the platform's address, the first of a list, and its own header first", () => {
    const of = (h: Record<string, string>) => addressOf(new Headers(h));
    expect(of({ "x-forwarded-for": "198.51.100.7" })).toBe("198.51.100.7");
    expect(of({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" })).toBe("198.51.100.7");
    expect(
      of({ "x-forwarded-for": "10.9.9.9", "x-vercel-forwarded-for": "198.51.100.7" }),
    ).toBe("198.51.100.7");
    expect(of({})).toBeNull();
    expect(of({ "x-forwarded-for": " " })).toBeNull();
  });

  it("lets a request on when the limiter itself fails, and reports the failure", async () => {
    const down = new Error("pool exhausted");
    const { deps, failures } = counting({ limiter: () => Promise.reject(down) });
    expect(
      await guardRequest(get({ "x-forwarded-for": "198.51.100.7" }), deps),
    ).toBeNull();
    expect(failures).toEqual([down]);
  });
});

describe("originsFrom", () => {
  it("reads the deployment's own list of origins", () => {
    expect(
      originsFrom({ CLERK_AUTHORIZED_PARTIES: "https://a.example, https://b.example" })(),
    ).toEqual(["https://a.example", "https://b.example"]);
    expect(originsFrom({})()).toEqual([]);
  });
});

describe("the route handler behind the guard", () => {
  let fixture: Awaited<ReturnType<typeof invitation>>;
  beforeEach(async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    fixture = await invitation(owner);
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  const signedIn = () => ({
    [DEV_SUBJECT_HEADER]: `dev:${fixture.email}`,
    [DEV_EMAIL_HEADER]: fixture.email,
  });

  it("refuses before any call runs: the database is never reached", async () => {
    const { deps } = counting();
    const handler = createTrpcHandler({
      getDb: () => unusableDb,
      identity: webIdentity,
      directory: localDirectory,
      reporter: quietReporter,
      edge: deps,
    });
    const response = await handler(
      post({ origin: "https://evil.example", ...signedIn() }),
    );
    expect(response.status).toBe(403);
  });

  it("limits a signed-in identity on its own, whatever address it calls from", async () => {
    const { deps, hits } = counting();
    const handler = createTrpcHandler({
      getDb,
      identity: webIdentity,
      directory: localDirectory,
      reporter: quietReporter,
      edge: deps,
    });
    const me = (address: string) =>
      handler(
        new Request(`${HOST}${ENDPOINT}/me.get`, {
          headers: { ...signedIn(), "x-forwarded-for": address },
        }),
      );
    expect((await me("198.51.100.7")).status).toBe(200);
    hits.set(`identity:dev:${fixture.email}`, IDENTITY_LIMIT.limit);
    const refused = await me("198.51.100.9");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("42");
    // Nobody signed in is not an identity: only the address is counted.
    const anonymous = await handler(
      new Request(`${HOST}${ENDPOINT}/me.get`, {
        headers: { "x-forwarded-for": "198.51.100.9" },
      }),
    );
    expect(anonymous.status).toBe(401);
    expect([...hits.keys()].filter((k) => k.startsWith("identity:"))).toHaveLength(1);
  });

  it("counts a real request in Postgres through the route as wired", async () => {
    const address = `203.0.113.${Math.floor(Math.random() * 250)}`;
    const response = await GET(
      new Request(
        `${HOST}${ENDPOINT}/status.get?input=${encodeURIComponent(
          JSON.stringify({ json: { protocolVersion: 1, platform: "ios", build: 1 } }),
        )}`,
        { headers: { "x-forwarded-for": address } },
      ),
    );
    expect(response.status).toBe(200);
    const { rateKey } = await import("@trader/api");
    const { rows } = await owner.execute<{ count: number }>(
      `select count from rate_limit_windows where key = '${rateKey("address", address)}'`,
    );
    expect(rows).toEqual([{ count: 1 }]);
    await owner.execute(
      `delete from rate_limit_windows where key = '${rateKey("address", address)}'`,
    );
  });
});
