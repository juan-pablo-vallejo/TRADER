// Release 0.1 R3: the readiness check, against the migrated compose database. A login as
// trader_app cannot be made here (the role has no password), so the deployed case is a
// transaction whose session authorization is trader_app, which is what a login sets.
import type { Db } from "@trader/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../src/app/api/ready/route";
import { getDb } from "../src/server/db";
import { createReadyHandler } from "../src/server/ready";
import { ownerDb, recordingReporter, unusableDb } from "./helpers";

let owner: Db;
beforeAll(() => {
  owner = ownerDb();
});
afterAll(async () => {
  await owner.$client.end();
});

// As a deployment's pool is: every connection logged in as trader_app.
const loggedInAsApp = {
  transaction: (body: (tx: unknown) => Promise<unknown>) =>
    owner.transaction(async (tx) => {
      await tx.execute(sql`set local session authorization trader_app`);
      return body(tx);
    }),
} as unknown as Db;

const answer = async (response: Response) => ({
  status: response.status,
  cache: response.headers.get("cache-control"),
  body: await response.text(),
});

describe("/api/ready", () => {
  it("answers 200 from the route as wired, uncached", async () => {
    expect(await answer(await GET())).toEqual({
      status: 200,
      cache: "no-store",
      body: '{"ready":true}',
    });
  });

  it("answers 200 on a deployment whose login is trader_app", async () => {
    const { reporter, events } = recordingReporter();
    const handler = createReadyHandler({
      getDb: () => loggedInAsApp,
      reporter,
      env: { NODE_ENV: "production" },
    });
    expect((await answer(await handler())).status).toBe(200);
    expect(events).toEqual([]);
  });

  it("answers 503 on a deployment that reaches trader_app by SET ROLE, and reports it", async () => {
    const { reporter, events } = recordingReporter();
    const handler = createReadyHandler({
      getDb: () => getDb(),
      reporter,
      env: { NODE_ENV: "production" },
    });
    expect(await answer(await handler())).toEqual({
      status: 503,
      cache: "no-store",
      body: '{"ready":false}',
    });
    expect(events).toEqual([
      {
        source: "request",
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        path: "ready",
        type: "query",
        errorNames: ["Error"],
        sqlstate: null,
      },
    ]);
  });

  it("answers 503 as the owner, a superuser, outside a deployment too", async () => {
    const { reporter, events } = recordingReporter();
    const handler = createReadyHandler({
      getDb: () => owner,
      reporter,
      env: { NODE_ENV: "test" },
    });
    expect((await answer(await handler())).status).toBe(503);
    expect(events).toHaveLength(1);
  });

  it("answers 503 with the same body when the database cannot be used at all", async () => {
    const { reporter, events } = recordingReporter();
    const handler = createReadyHandler({ getDb: () => unusableDb, reporter, env: {} });
    expect(await answer(await handler())).toEqual({
      status: 503,
      cache: "no-store",
      body: '{"ready":false}',
    });
    expect(events).toHaveLength(1);
  });
});
