// The readiness check, against the migrated compose database. A login as
// trader_app cannot be made here (the role has no password), so the deployed case is a
// transaction whose session authorization is trader_app, which is what a login sets.
import type { Db } from "@trader/db";
import { companies } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
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
      body: '{"ready":true,"commit":null}',
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
      body: '{"ready":false,"commit":null}',
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
      body: '{"ready":false,"commit":null}',
    });
    expect(events).toHaveLength(1);
  });

  // Where a Demo door is configured, whether the database flags its company as Demo.
  // Unflagged, the door refuses everyone; ready either way, since it can serve.
  it("says whether the Demo door's company is flagged, where there is a door", async () => {
    const [made] = await owner
      .insert(companies)
      .values({ name: `Ready demo ${Date.now()}`, timezone: "America/New_York" })
      .returning({ id: companies.id });
    const id = made!.id;
    const bodyWith = async (env: Record<string, string>) => {
      const { reporter } = recordingReporter();
      const handler = createReadyHandler({
        getDb: () => loggedInAsApp,
        reporter,
        env: { NODE_ENV: "production", ...env },
      });
      return (await answer(await handler())).body;
    };
    const door = {
      DEMO_SIGN_IN_CODE: "a-long-demo-code-0123456789",
      DEMO_COMPANY_ID: id,
    };
    try {
      expect(await bodyWith(door)).toBe('{"ready":true,"commit":null,"demo":false}');
      await owner.update(companies).set({ demo: true }).where(eq(companies.id, id));
      expect(await bodyWith(door)).toBe('{"ready":true,"commit":null,"demo":true}');
      expect(await bodyWith({})).toBe('{"ready":true,"commit":null}');
    } finally {
      await owner.delete(companies).where(eq(companies.id, id));
    }
  });

  it("names the commit it was built from, and only a full commit id", async () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const bodyWith = async (value: string | undefined) => {
      const { reporter } = recordingReporter();
      const handler = createReadyHandler({
        getDb: () => loggedInAsApp,
        reporter,
        env: { NODE_ENV: "production", VERCEL_GIT_COMMIT_SHA: value },
      });
      return (await answer(await handler())).body;
    };
    expect(await bodyWith(sha)).toBe(`{"ready":true,"commit":"${sha}"}`);
    for (const other of [
      undefined,
      "",
      "abc123",
      sha.toUpperCase(),
      `${sha}0`,
      `${sha}\n`,
    ]) {
      expect(await bodyWith(other)).toBe('{"ready":true,"commit":null}');
    }
  });

  it("names the commit when it is not ready too", async () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const { reporter } = recordingReporter();
    const handler = createReadyHandler({
      getDb: () => unusableDb,
      reporter,
      env: { NODE_ENV: "production", VERCEL_GIT_COMMIT_SHA: sha },
    });
    expect(await answer(await handler())).toMatchObject({
      status: 503,
      body: `{"ready":false,"commit":"${sha}"}`,
    });
  });
});
