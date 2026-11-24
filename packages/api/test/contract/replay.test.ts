// Every released build's calls, replayed (H4). builds/<date>-<commit>/calls.json is what a
// build sends, recorded through the phone's own client (apps/mobile test/calls.test.ts). A
// build is used for weeks, so this server must still understand each call of every build
// kept here: none may be refused as malformed (BAD_REQUEST), and no sync record as
// `invalid_record`. Refusals of the data itself (unknown ids, a gate) are fine: they say the
// call was understood. A build is removed from here once TRADER_MIN_BUILD_* has passed it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import superjson, { type SuperJSONResult } from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "../../src/router";
import { PHONE_PROCEDURES } from "../../src/contract";
import { appDb, http, member, ownerDb, world, type World } from "../helpers";

const BUILDS = join(import.meta.dirname, "builds");

type Recorded = { path: string; type: "query" | "mutation"; input: SuperJSONResult };

export const builds = () =>
  readdirSync(BUILDS)
    .filter((d) => /^\d{4}-\d{2}-\d{2}-[0-9a-f]{7,}$/.test(d))
    .sort()
    .map((dir) => ({
      dir,
      calls: JSON.parse(
        readFileSync(join(BUILDS, dir, "calls.json"), "utf8"),
      ) as Recorded[],
    }));

const owner = ownerDb();
const app = appDb();
let w: World;
let admin: Awaited<ReturnType<typeof member>>;
beforeAll(async () => {
  w = await world(owner);
  // An admin may make every call the phone makes; a worker's are a subset.
  admin = await member(owner, w, "a", "admin", { label: "replay" });
});
afterAll(async () => {
  await w.cleanup();
  await app.$client.end();
  await owner.$client.end();
});

// What a replayed call came back as: its error code, or each sync record's result.
export async function replay(call: Recorded) {
  const answer = await http(
    app,
    admin.who,
    [
      {
        path: call.path,
        input: superjson.deserialize(call.input),
        mutation: call.type === "mutation",
      },
    ],
    { router: appRouter },
  );
  const r = answer.results[0]!;
  const records = (
    r.result?.data.json as { results?: { result: string; code?: string }[] }
  )?.results;
  return {
    path: call.path,
    code: r.error?.json.data.code ?? null,
    invalid: (records ?? []).filter((x) => x.code === "invalid_record").length,
  };
}

describe("every kept build's calls", () => {
  it("keeps at least one build, each calling only the phone's procedures", () => {
    const all = builds();
    expect(all.length).toBeGreaterThan(0);
    for (const b of all) {
      for (const c of b.calls) {
        expect([
          b.dir,
          c.path,
          (PHONE_PROCEDURES as readonly string[]).includes(c.path),
        ]).toEqual([b.dir, c.path, true]);
      }
    }
  });

  it("is understood by this server: no BAD_REQUEST, no invalid_record", async () => {
    for (const b of builds()) {
      for (const c of b.calls) {
        const r = await replay(c);
        expect({
          build: b.dir,
          ...r,
          code: r.code === "BAD_REQUEST" ? r.code : "understood",
        }).toEqual({
          build: b.dir,
          path: c.path,
          code: "understood",
          invalid: 0,
        });
      }
    }
  });
});
