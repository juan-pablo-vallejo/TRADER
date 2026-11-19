// What stands in front of the API route (server/edge.ts, server/handler.ts): the body limit
// and the `Origin` check, each refusing before a call runs.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER, localDirectory } from "@trader/api";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import {
  guardRequest,
  MAX_BODY_BYTES,
  originsFrom,
  type EdgeDependencies,
} from "../src/server/edge";
import { createTrpcHandler, ENDPOINT } from "../src/server/handler";
import { webIdentity } from "../src/server/identity";
import { quietReporter, unusableDb } from "./helpers";

afterAll(async () => {
  await getDb().$client.end();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const HOST = "https://office.example";
const deps: EdgeDependencies = { authorizedOrigins: () => ["https://staging.example"] };

const post = (headers: Record<string, string> = {}, body = "{}") =>
  new Request(`${HOST}${ENDPOINT}/me.update`, {
    method: "POST",
    headers: { "content-length": String(body.length), ...headers },
    body,
  });
const get = (headers: Record<string, string> = {}) =>
  new Request(`${HOST}${ENDPOINT}/status.get`, { headers });

describe("guardRequest", () => {
  it("refuses a body over the limit, of unstated length or of malformed length", () => {
    const statuses = [];
    for (const length of [String(MAX_BODY_BYTES + 1), "1e9", "-5"]) {
      statuses.push(guardRequest(post({ "content-length": length }), deps)?.status);
    }
    expect(statuses).toEqual([413, 400, 400]);
    const unstated = new Request(`${HOST}${ENDPOINT}/me.update`, { method: "POST" });
    expect(guardRequest(unstated, deps)?.status).toBe(411);
    // At the limit, and a GET with no body at all, go on.
    expect(
      guardRequest(post({ "content-length": String(MAX_BODY_BYTES) }), deps),
    ).toBeNull();
    expect(guardRequest(get(), deps)).toBeNull();
  });

  it("refuses a state-changing request from another site's origin, and no other", () => {
    const from = (origin: string | null, method = "POST") => {
      const headers: Record<string, string> = origin === null ? {} : { origin };
      const req = method === "POST" ? post(headers) : get(headers);
      return guardRequest(req, deps)?.status ?? "on";
    };
    expect(from("https://evil.example")).toBe(403);
    expect(from("null")).toBe(403);
    expect(from("https://office.example.evil.example")).toBe(403);
    // This deployment's own origin, one it authorizes, and no origin at all: the phone.
    expect(from(HOST)).toBe("on");
    expect(from("https://staging.example")).toBe("on");
    expect(from(null)).toBe("on");
    // A read changes nothing: a foreign origin learns only what the browser lets it.
    expect(from("https://evil.example", "GET")).toBe("on");
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
  const signedIn = {
    [DEV_SUBJECT_HEADER]: "dev:nobody@edge.invalid",
    [DEV_EMAIL_HEADER]: "nobody@edge.invalid",
  };

  it("refuses before any call runs: the database is never reached", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const handler = createTrpcHandler({
      getDb: () => unusableDb,
      identity: webIdentity,
      directory: localDirectory,
      reporter: quietReporter,
      edge: deps,
    });
    const response = await handler(post({ origin: "https://evil.example", ...signedIn }));
    expect(response.status).toBe(403);
  });

  it("stands in front of the route as wired", async () => {
    expect((await POST(post({ origin: "https://evil.example" }))).status).toBe(403);
    const unstated = new Request(`${HOST}${ENDPOINT}/me.update`, { method: "POST" });
    expect((await POST(unstated)).status).toBe(411);
  });
});
