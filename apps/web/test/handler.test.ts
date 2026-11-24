// The route handler as Next calls it. `status.get` answers with no identity, no
// database and `no-store`; a protected call without an identity is 401; a failing call
// reaches the reporter once; a signed-in call runs under trader_app against the real pool.
import { companies, users } from "@trader/db/schema";
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER, localDirectory } from "@trader/api";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import {
  createTrpcHandler,
  ENDPOINT,
  logToStdout,
  MAX_BATCH_SIZE,
} from "../src/server/handler";
import { webIdentity } from "../src/server/identity";
import {
  invitation,
  ownerDb,
  query,
  quietReporter,
  recordingReporter,
  unusableDb,
} from "./helpers";

const owner = ownerDb();
let fixture: Awaited<ReturnType<typeof invitation>>;

beforeEach(async () => {
  fixture = await invitation(owner);
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await getDb().$client.end();
  await owner.$client.end();
});

const signedIn = () => ({
  [DEV_SUBJECT_HEADER]: `dev:${fixture.email}`,
  [DEV_EMAIL_HEADER]: fixture.email,
});

describe("the route handler", () => {
  it("answers status.get with no identity, no database, and no-store", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "");
    const handler = createTrpcHandler({
      getDb: () => unusableDb,
      identity: webIdentity,
      directory: localDirectory,
      reporter: quietReporter,
    });
    const r = await query(handler, "status.get", {
      input: { protocolVersion: 1, platform: "ios", build: 1 },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.body.result?.data.json).toEqual({ version: 1, state: "normal" });
  });

  it("refuses a batch above the cap before any call runs", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "");
    const handler = createTrpcHandler({
      getDb: () => unusableDb,
      identity: webIdentity,
      directory: localDirectory,
      reporter: quietReporter,
    });
    const batch = (n: number) => {
      const paths = Array.from({ length: n }, () => "status.get").join(",");
      const input = Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          i,
          { json: { protocolVersion: 1, platform: "ios", build: 1 } },
        ]),
      );
      const url = new URL(`http://test${ENDPOINT}/${paths}`);
      url.searchParams.set("batch", "1");
      url.searchParams.set("input", JSON.stringify(input));
      return handler(new Request(url));
    };
    expect((await batch(MAX_BATCH_SIZE)).status).toBe(200);
    expect((await batch(MAX_BATCH_SIZE + 1)).status).toBe(400);
  });

  it("answers me.get UNAUTHORIZED, 401, without an identity", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "");
    const r = await query(GET, "me.get", { headers: signedIn() });
    expect(r.status).toBe(401);
    expect(r.body.error?.json.data.code).toBe("UNAUTHORIZED");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("reports a failing call once, after it settled, with nothing of the request", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const { reporter, events } = recordingReporter();
    const handler = createTrpcHandler({
      getDb: () => unusableDb,
      identity: webIdentity,
      directory: localDirectory,
      reporter,
    });
    const r = await query(handler, "me.get", { headers: signedIn() });
    expect(r.status).toBe(500);
    expect(r.body.error?.json.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(r.body.error?.json.message).toBe("Internal server error.");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: "request", path: "me.get", type: "query" });
    expect(JSON.stringify(events)).not.toContain(fixture.email);
  });

  it("makes one request id per request, and never takes the client's", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const { reporter, events } = recordingReporter();
    const handler = createTrpcHandler({
      getDb: () => unusableDb,
      identity: webIdentity,
      directory: localDirectory,
      reporter,
    });
    const claimed = "11111111-1111-4111-8111-111111111111";
    const headers = { ...signedIn(), "x-request-id": claimed };
    await query(handler, "me.get", { headers });
    await query(handler, "me.get", { headers });
    const ids = events.map((e) => e.requestId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids).not.toContain(claimed);
  });

  it("answers me.get 200 for a signed-in invitation, binding it under trader_app", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const r = await query(GET, "me.get", { headers: signedIn() });
    expect(r.status).toBe(200);
    expect(r.body.result?.data.json).toMatchObject({
      id: fixture.userId,
      companyId: fixture.companyId,
      email: fixture.email,
      role: "worker",
    });
    const [row] = await owner
      .select({ identitySubject: users.identitySubject })
      .from(users)
      .where(eq(users.id, fixture.userId));
    expect(row?.identitySubject).toBe(`dev:${fixture.email}`);
    const [company] = await owner
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, fixture.companyId));
    expect(company).toBeDefined();
  });

  it("logs a refused record on a line of its own, under the call's request id", () => {
    const out: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((l: string) => out.push(l));
    try {
      logToStdout({
        requestId: "r",
        path: "sync.push",
        type: "mutation",
        ms: 1,
        statements: 4,
        ok: true,
        code: null,
        refusals: [
          { recordId: "a", kind: "labor_event", code: "no_open_session" },
          { recordId: "b", kind: null, code: "invalid_record" },
        ],
      });
    } finally {
      log.mockRestore();
    }
    expect(out.map((l) => JSON.parse(l) as unknown)).toEqual([
      {
        trader_call: {
          requestId: "r",
          path: "sync.push",
          type: "mutation",
          ms: 1,
          statements: 4,
          ok: true,
          code: null,
          refused: 2,
        },
      },
      {
        trader_refusal: {
          requestId: "r",
          path: "sync.push",
          recordId: "a",
          kind: "labor_event",
          code: "no_open_session",
        },
      },
      {
        trader_refusal: {
          requestId: "r",
          path: "sync.push",
          recordId: "b",
          kind: null,
          code: "invalid_record",
        },
      },
    ]);
  });

  it("logs one timing line per call, and answers Server-Timing only where asked", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "");
    const lines: unknown[] = [];
    const make = (timingHeaders: boolean) =>
      createTrpcHandler({
        getDb: () => unusableDb,
        identity: webIdentity,
        directory: localDirectory,
        reporter: quietReporter,
        logCall: (line) => lines.push(line),
        timingHeaders: () => timingHeaders,
      });
    const input = { input: { protocolVersion: 1, platform: "ios", build: 1 } };
    const shown = await query(make(true), "status.get", input);
    expect(lines).toEqual([
      expect.objectContaining({ path: "status.get", ok: true, statements: 0 }),
    ]);
    const id = shown.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines[0]).toMatchObject({ requestId: id });
    expect(shown.headers.get("server-timing")).toMatch(
      /^call;desc="status\.get, 0 statements";dur=[0-9.]+$/,
    );
    const hidden = await query(make(false), "status.get", input);
    expect(lines).toHaveLength(2);
    expect(hidden.headers.get("server-timing")).toBeNull();
    expect(hidden.headers.get("x-request-id")).toBeNull();
  });
});
