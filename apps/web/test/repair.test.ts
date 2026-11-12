// TASKS, Stage 4: labor repair from the ledger screen and the approval of what it wrote, over
// the real transport — the route module as Next calls it, the bodies in superjson's envelope,
// and the repair sets built by the screen's own builder (src/app/ledger/repair-set.ts) from
// what `labor.ledger` answered. The rules of a repair and of a decision are the api suite's
// (labor/repair*.test.ts, approvals/); this holds the screen's path through them together.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import type { AppRouter } from "@trader/api";
import type { Db } from "@trader/db";
import { auditLog, customers, jobs, users } from "@trader/db/schema";
import type { inferRouterOutputs } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
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
import { uuidv7 } from "../src/app/closeout/uuidv7";
import {
  createMinter,
  draftOf,
  missingHours,
  sessionOperations,
  voidOperation,
} from "../src/app/ledger/repair-set";
import { getDb } from "../src/server/db";
import { ENDPOINT } from "../src/server/handler";
import { disposableDb, invitation, type TrpcResult } from "./helpers";

type Out = inferRouterOutputs<AppRouter>;

// A database of its own: a ledger row, an approval's decision and an audit row are
// append-only and reference their company and people, so nothing written here could be
// deleted again.
let D: Awaited<ReturnType<typeof disposableDb>>;
let owner: Db;
let admin: Awaited<ReturnType<typeof invitation>>;
let workerId: string;
let jobId: string;
let otherJobId: string;

beforeAll(async () => {
  D = await disposableDb();
  owner = D.owner;
  getDb(D.env);
}, 60_000);
beforeEach(async () => {
  admin = await invitation(owner, { role: "admin" });
  const [worker] = await owner
    .insert(users)
    .values({
      companyId: admin.companyId,
      email: `worker-${admin.run}@web.test`,
      name: "Worker",
      role: "worker",
    })
    .returning({ id: users.id });
  workerId = worker!.id;
  const [customer] = await owner
    .insert(customers)
    .values({ companyId: admin.companyId, name: "Customer" })
    .returning({ id: customers.id });
  const made = await owner
    .insert(jobs)
    .values(
      ["Porch", "Garage"].map((name) => ({
        companyId: admin.companyId,
        customerId: customer!.id,
        name,
      })),
    )
    .returning({ id: jobs.id, name: jobs.name });
  jobId = made.find((j) => j.name === "Porch")!.id;
  otherJobId = made.find((j) => j.name === "Garage")!.id;
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

const NY = "America/New_York";
const DAY = "2026-10-05";

// One call as the browser's client makes it: the input serialized by superjson, the answer
// read back through it.
async function call<T = unknown>(
  path: string,
  input: unknown,
  headers: Record<string, string> = {},
  mutation = false,
) {
  const wire = JSON.stringify(superjson.serialize(input));
  const url = new URL(`http://test${ENDPOINT}/${path}`);
  if (!mutation) url.searchParams.set("input", wire);
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
      : (superjson.deserialize(body.result.data as never) as T);
  return { status: response.status, code: body.error?.json.data.code, data };
}

const me = () => as(admin.email);
const repair = (input: unknown, headers: Record<string, string> = me()) =>
  call<Out["labor"]["repair"]>("labor.repair", input, headers, true);
const ledger = (who: string) =>
  call<Out["labor"]["ledger"]>(
    "labor.ledger",
    { workerId: who, from: DAY, to: DAY },
    me(),
  );
const queue = () => call<Out["approval"]["queue"]>("approval.queue", { limit: 50 }, me());
const decide = (approvalId: string, decision: "approved" | "rejected") =>
  call<Out["approval"]["decide"]>(
    "approval.decide",
    { approvalId, decision },
    me(),
    true,
  );
const audited = async () =>
  (
    await owner
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.companyId, admin.companyId))
      .orderBy(asc(auditLog.id))
  ).map((r) => r.action);

// A day's hours for `who` as the "Add missing hours" form builds them: 7:00 to 3:30 Eastern.
function hours(who: string) {
  const built = missingHours({ jobId, start: `${DAY}T07:00`, end: `${DAY}T15:30` }, NY);
  if (!built.ok) throw new Error("fixture");
  return createMinter()(who, built.operations);
}

describe("labor repair through the route handler", () => {
  it("answers 401 anonymous, 403 to a worker and for another company's person, 400 for an id that is not a UUIDv7", async () => {
    const set = hours(workerId);
    expect((await repair(set, {})).status).toBe(401);
    const outsider = await invitation(owner);
    expect((await repair(set, as(outsider.email))).status).toBe(403);
    expect((await repair(hours(outsider.userId))).status).toBe(403);
    const v4 = {
      workerId,
      operations: [{ ...set.operations[0]!, id: crypto.randomUUID() }],
    };
    expect((await repair(v4)).status).toBe(400);
    // Nothing was written by any of them.
    expect((await ledger(workerId)).data?.sessions).toEqual([]);
    expect(await audited()).toEqual([]);
  });

  it("adds missing hours that wait, lets their writer approve them, and counts them", async () => {
    const set = hours(workerId);
    const first = await repair(set);
    // An office entry carries no location stamp, so the server flags that as well.
    expect(first.data).toMatchObject({
      result: "accepted",
      events: [
        { id: set.operations[0]!.id, reasons: ["user_timed", "location"] },
        { id: set.operations[1]!.id, reasons: ["user_timed", "location"] },
      ],
    });
    // The same set again, as after an answer that never arrived.
    expect((await repair(set)).data).toMatchObject({ result: "duplicate" });

    const pending = (await ledger(workerId)).data!;
    expect(pending.timezone).toBe(NY);
    expect(pending.sessions).toMatchObject([
      {
        workDate: DAY,
        job: { id: jobId },
        complete: true,
        structuralWorkedMs: 8.5 * 3_600_000,
        accounting: "pending",
        eligibleWorkedMs: 0,
        events: [
          { type: "started", initiator: { id: admin.userId }, timeSetByUser: true },
          { type: "ended", initiator: { id: admin.userId }, timeSetByUser: true },
        ],
      },
    ]);

    const waiting = (await queue()).data!;
    expect(waiting.timezone).toBe(NY);
    expect(waiting.items.map((i) => [i.subject.kind, i.ownEntry, i.reasons])).toEqual([
      ["labor_event", false, ["user_timed", "location"]],
      ["labor_event", false, ["user_timed", "location"]],
    ]);
    for (const item of waiting.items) {
      expect((await decide(item.approvalId, "approved")).data).toMatchObject({
        result: "decided",
      });
    }
    // The same press again is answered as itself; the other decision is refused.
    const again = waiting.items[0]!.approvalId;
    expect((await decide(again, "approved")).data).toMatchObject({
      result: "duplicate",
    });
    expect((await decide(again, "rejected")).data).toMatchObject({
      result: "rejected",
      code: "already_decided",
    });

    expect((await queue()).data?.items).toEqual([]);
    expect((await ledger(workerId)).data?.sessions).toMatchObject([
      { accounting: "eligible", eligibleWorkedMs: 8.5 * 3_600_000 },
    ]);
    expect(await audited()).toEqual([
      "work_session_events.repair",
      "approvals.decide",
      "approvals.decide",
    ]);
  });

  it("corrects from what the ledger showed, and refuses a set built from an entry no longer in effect", async () => {
    await repair(hours(workerId));
    const shown = (await ledger(workerId)).data!.sessions[0]!;
    const draft = draftOf(shown, NY);
    expect(sessionOperations(shown, draft, NY)).toEqual({ ok: true, operations: [] });

    // A later clock out, a move to the other job, and a break: one set.
    const end = shown.events.find((e) => e.type === "ended")!;
    const built = sessionOperations(
      shown,
      {
        jobId: otherJobId,
        times: { ...draft.times, [end.id]: `${DAY}T16:00` },
        added: [
          { type: "paused", at: `${DAY}T12:00` },
          { type: "resumed", at: `${DAY}T12:30` },
        ],
      },
      NY,
    );
    if (!built.ok) throw new Error("the draft is well formed");
    const answer = await repair(createMinter()(workerId, built.operations));
    expect(answer.data).toMatchObject({ result: "accepted" });
    expect(answer.data?.result === "accepted" && answer.data.events).toHaveLength(4);

    const repaired = (await ledger(workerId)).data!.sessions;
    expect(repaired).toMatchObject([
      {
        job: { id: otherJobId },
        corrected: true,
        // 7:00 to 4:00 less the half-hour break.
        structuralWorkedMs: 8.5 * 3_600_000,
        breakMs: 30 * 60_000,
        accounting: "pending",
      },
    ]);
    expect(
      repaired[0]!.events.filter((e) => e.effect === "superseded").map((e) => e.type),
    ).toEqual(["started", "ended"]);

    // The first read is stale now: a correction built from it replaces an entry that is no
    // longer the one in effect.
    const stale = sessionOperations(
      shown,
      { ...draft, times: { ...draft.times, [end.id]: `${DAY}T15:00` } },
      NY,
    );
    if (!stale.ok) throw new Error("the draft is well formed");
    expect((await repair(createMinter()(workerId, stale.operations))).data).toMatchObject(
      { result: "rejected", code: "repair_stale" },
    );

    // A void names the session's root, and a second one is refused.
    const voided = await repair(createMinter()(workerId, [voidOperation(repaired[0]!)]));
    expect(voided.data).toMatchObject({ result: "accepted" });
    expect(
      (await repair(createMinter()(workerId, [voidOperation(repaired[0]!)]))).data,
    ).toMatchObject({ result: "rejected", code: "already_voided" });
    // One audit row per accepted set; a refusal leaves none.
    expect(await audited()).toEqual([
      "work_session_events.repair",
      "work_session_events.repair",
      "work_session_events.repair",
    ]);
  });

  // V1-D10 as amended: an admin's own labor needs no approval. The answer carries no
  // reasons, which is what the screen's saved note reads.
  it("counts an admin's own repaired hours at once, with nothing to decide", async () => {
    const saved = (await repair(hours(admin.userId))).data;
    expect(saved).toMatchObject({
      result: "accepted",
      events: [{ reasons: [] }, { reasons: [] }],
    });
    expect((await queue()).data!.items).toEqual([]);
    expect((await ledger(admin.userId)).data?.sessions).toMatchObject([
      { accounting: "eligible", events: [{ approval: null }, { approval: null }] },
    ]);
    expect(await audited()).toEqual(["work_session_events.repair"]);
  });

  it("refuses a time that has not happened, writing nothing", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    const set = {
      workerId,
      operations: [
        {
          kind: "append",
          id: uuidv7(),
          type: "started",
          jobId,
          clientTimestamp: tomorrow,
        },
      ],
    };
    expect((await repair(set)).data).toMatchObject({
      result: "rejected",
      code: "time_in_future",
    });
    expect(await audited()).toEqual([]);
  });
});
