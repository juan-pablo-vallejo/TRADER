// TASKS:50: reporting through the fetch adapter, as the route handler will wire it. A failed
// call is reported after its transaction rolled back, reports carry nothing of the request, and
// a reporter that fails changes no answer and no commit. Expected answers are never reported.
import { customers } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appDb,
  customerNames,
  failure,
  http,
  identity,
  ownerDb,
  recordingReporter,
  rejectingReporter,
  throwingReporter,
  world,
  type World,
} from "./helpers";

const owner = ownerDb();
const app = appDb();
let w: World;

beforeEach(async () => {
  w = await world(owner);
});
afterEach(async () => {
  await w.cleanup();
});
afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

const asA = () => identity(w.a.boundSubject, w.a.boundEmail);
const failedWrite = (name: string) => [
  { path: "probe.write", input: { name, fail: true }, mutation: true },
];

describe("reporting a failed call", () => {
  it("reports once after the rollback; the answer is today's", async () => {
    const { reporter, events } = recordingReporter();
    const quiet = await http(app, asA(), failedWrite(`Quiet ${w.run}`));
    const loud = await http(app, asA(), failedWrite(`Loud ${w.run}`), { reporter });
    expect(loud.status).toBe(quiet.status);
    expect(failure(loud.results[0])).toEqual(failure(quiet.results[0]));
    expect(failure(loud.results[0]).code).toBe("INTERNAL_SERVER_ERROR");
    expect(await customerNames(owner, w.a.companyId)).not.toContain(`Loud ${w.run}`);
    expect(events).toMatchObject([
      { source: "request", path: "probe.write", type: "mutation", sqlstate: null },
    ]);
  });

  it("changes no answer and no commit when the reporter throws or rejects", async () => {
    const quiet = await http(app, asA(), failedWrite(`Quiet ${w.run}`));
    for (const reporter of [throwingReporter, rejectingReporter]) {
      const answer = await http(app, asA(), failedWrite(`Broken ${w.run}`), { reporter });
      expect(answer).toEqual(quiet);
    }
    const kept = await http(
      app,
      asA(),
      [
        {
          path: "probe.write",
          input: { name: `Kept ${w.run}`, fail: false },
          mutation: true,
        },
      ],
      { reporter: throwingReporter },
    );
    expect(kept.results[0]?.result?.data.json).toBe("written");
    const rows = await owner
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.companyId, w.a.companyId));
    expect(rows.map((r) => r.name)).toContain(`Kept ${w.run}`);
    expect(rows.map((r) => r.name)).not.toContain(`Broken ${w.run}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("reports a database error by SQLSTATE and nothing of the caller or the query", async () => {
    const { reporter, events } = recordingReporter();
    await http(app, asA(), [{ path: "probe.divideByZero" }], { reporter });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ path: "probe.divideByZero", sqlstate: "22012" });
    const text = JSON.stringify(events);
    for (const secret of [
      w.a.boundEmail,
      w.a.boundSubject,
      w.a.companyId,
      "select",
      "1 / 0",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("reports one event for one failed call in a batch", async () => {
    const { reporter, events } = recordingReporter();
    await http(app, asA(), [{ path: "probe.divideByZero" }, { path: "probe.inside" }], {
      reporter,
    });
    expect(events.map((e) => e.path)).toEqual(["probe.divideByZero"]);
  });

  it("reports no expected answer: anonymous, uninvited, wrong role, bad input", async () => {
    const { reporter, events } = recordingReporter();
    const answers = [
      await http(app, null, [{ path: "gate.protected" }], { reporter }),
      await http(
        app,
        identity(`sub-none-${w.run}`, "nobody@co.test"),
        [{ path: "gate.protected" }],
        { reporter },
      ),
      await http(app, asA(), [{ path: "gate.admin" }], { reporter }),
      await http(app, asA(), [{ path: "probe.customer", input: { id: "nope" } }], {
        reporter,
      }),
    ].map((a) => failure(a.results[0]).code);
    expect(answers).toEqual(["UNAUTHORIZED", "UNAUTHORIZED", "FORBIDDEN", "BAD_REQUEST"]);
    expect(events).toEqual([]);
  });
});
