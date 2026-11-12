// TASKS, Stage 4: pay periods (V1-D03), over the real transport — the route module as Next
// calls it, the bodies in superjson's envelope as the screen sends them and the close's
// instant read back through it: an admin opens a period, reads it, closes it, and the same
// close again answers the one that stands; nobody else gets in. What a close stores from a
// ledger is the api suite's (pay-periods/close.test.ts).
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import type { Db } from "@trader/db";
import { payPeriodLines, payPeriods } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { GET, POST } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import { ENDPOINT } from "../src/server/handler";
import { disposableDb, invitation, type TrpcResult } from "./helpers";

// A database of its own: a closed period can never be deleted, and it references its company
// and its closer.
let D: Awaited<ReturnType<typeof disposableDb>>;
let owner: Db;
let admin: Awaited<ReturnType<typeof invitation>>;

beforeAll(async () => {
  D = await disposableDb();
  owner = D.owner;
  getDb(D.env);
}, 60_000);
beforeEach(async () => {
  admin = await invitation(owner, { role: "admin" });
  vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await D.drop([getDb()]);
});

const as = (email: string) => ({
  [DEV_SUBJECT_HEADER]: `dev:${email}`,
  [DEV_EMAIL_HEADER]: email,
});

const WEEK = { startsOn: "2026-10-05", endsOn: "2026-10-11" };

// One call as the browser's client makes it: the input serialized by superjson, the answer
// read back through it.
async function call(
  path: string,
  input: unknown,
  headers: Record<string, string> = {},
  mutation = false,
) {
  const wire = JSON.stringify(superjson.serialize(input));
  const url = new URL(`http://test${ENDPOINT}/${path}`);
  if (!mutation && input !== undefined) url.searchParams.set("input", wire);
  const response = await (mutation ? POST : GET)(
    new Request(
      url,
      mutation
        ? {
            method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: wire,
          }
        : { headers },
    ),
  );
  const body = (await response.json()) as TrpcResult;
  const data =
    body.result === undefined
      ? undefined
      : superjson.deserialize(body.result.data as never);
  return { status: response.status, code: body.error?.json.data.code, data };
}

describe("pay periods through the route handler", () => {
  it("answers 401 anonymous and 403 to a worker and a foreman, on every procedure", async () => {
    const periodId = crypto.randomUUID();
    const calls: [string, unknown, boolean][] = [
      ["payPeriod.list", undefined, false],
      ["payPeriod.read", { periodId }, false],
      ["payPeriod.open", WEEK, true],
      ["payPeriod.update", { periodId, ...WEEK }, true],
      ["payPeriod.close", { periodId }, true],
    ];
    for (const [path, input, mutation] of calls) {
      expect([path, (await call(path, input, {}, mutation)).status]).toEqual([path, 401]);
    }
    for (const role of ["worker", "foreman"] as const) {
      const other = await invitation(owner, { role });
      for (const [path, input, mutation] of calls) {
        const r = await call(path, input, as(other.email), mutation);
        expect([role, path, r.code]).toEqual([role, path, "FORBIDDEN"]);
      }
    }
    expect(await owner.select().from(payPeriods)).toEqual([]);
  });

  it("lets an admin open a period, read it, and close it once", async () => {
    const headers = as(admin.email);
    const opened = await call("payPeriod.open", WEEK, headers, true);
    expect(opened.data).toMatchObject({
      result: "opened",
      period: { ...WEEK, closed: null },
    });
    const { period } = opened.data as { period: { id: string } };

    const listed = await call("payPeriod.list", undefined, headers);
    expect(listed.status).toBe(200);
    expect(listed.data).toMatchObject({
      timezone: "America/New_York",
      periods: [{ id: period.id, ...WEEK, closed: null }],
    });

    // Nothing is recorded in this company: the read is zeros in the shape the screens read.
    const read = await call("payPeriod.read", { periodId: period.id }, headers);
    expect(read.data).toEqual({
      timezone: "America/New_York",
      period: { id: period.id, ...WEEK, closed: null },
      approved: { cells: [], workers: [], total: 0 },
      adjustments: { lines: [], total: 0, carriedBy: null },
      unresolved: { cells: [], pendingSessions: 0, openSessions: 0 },
    });

    // 32 days is refused before any procedure runs; a gap names the day a period may start.
    expect(
      (
        await call(
          "payPeriod.open",
          { startsOn: "2026-10-12", endsOn: "2026-11-12" },
          headers,
          true,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "payPeriod.open",
          { startsOn: "2026-10-19", endsOn: "2026-10-25" },
          headers,
          true,
        )
      ).data,
    ).toEqual({
      result: "rejected",
      code: "not_contiguous",
      expectedStartsOn: "2026-10-12",
    });

    const closed = await call("payPeriod.close", { periodId: period.id }, headers, true);
    expect(closed.data).toMatchObject({
      result: "closed",
      period: {
        id: period.id,
        closed: {
          // An instant, through superjson, as the screen formats it.
          at: expect.any(Date),
          by: { id: admin.userId },
          unresolved: { pendingSessions: 0, openSessions: 0 },
        },
      },
      lines: { own: 0, adjustments: 0 },
    });
    const again = await call("payPeriod.close", { periodId: period.id }, headers, true);
    expect(again.data).toEqual({
      result: "rejected",
      code: "already_closed",
      period: (closed.data as { period: unknown }).period,
    });
    const [row] = await owner
      .select()
      .from(payPeriods)
      .where(eq(payPeriods.id, period.id));
    expect(row).toMatchObject({ closedByUserId: admin.userId });
    expect(row!.closedAt).toEqual(
      (closed.data as { period: { closed: { at: Date } } }).period.closed.at,
    );
    expect(await owner.select().from(payPeriodLines)).toEqual([]);
  });

  it("answers another company's period as not permitted", async () => {
    const other = await invitation(owner, { role: "admin" });
    const theirs = await call("payPeriod.open", WEEK, as(other.email), true);
    const { period } = theirs.data as { period: { id: string } };
    for (const [path, mutation] of [
      ["payPeriod.read", false],
      ["payPeriod.close", true],
    ] as const) {
      const r = await call(path, { periodId: period.id }, as(admin.email), mutation);
      expect([path, r.code]).toEqual([path, "FORBIDDEN"]);
    }
  });
});
