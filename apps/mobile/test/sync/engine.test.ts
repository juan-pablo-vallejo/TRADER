// The sync cycle under failure (RULES: dropped responses, duplicate pushes, a backlog; TASKS
// R5, outbox and sync states). The server here is a stand-in that keeps what it accepted by
// id, as the real one does, and can be told to lose a response, stop part-way, refuse a
// record or change the service's state.
import type { PullOutput, ServiceState } from "@trader/api/contract";
import { describe, expect, it } from "vitest";

import { createMinter } from "../../src/ids";
import { recordsFor } from "../../src/sync/clock";
import {
  createSyncer,
  READING_KEY,
  readSnapshot,
  RECLAIM_MS,
  runCycle,
} from "../../src/sync/engine";
import type { PushAnswer, Transport } from "../../src/sync/types";
import { memoryStore } from "../memory-store";

const ME = "01900000-0000-7000-8000-000000000001";
const JOB = "01900000-0000-7000-8000-00000000000a";
const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);

function server() {
  const accepted = new Map<string, number>();
  const s = {
    accepted,
    pushes: [] as string[][],
    state: "normal" as ServiceState,
    statusDown: false,
    pullDown: false,
    // The flags the server judged for an id, written with the entry.
    flagged: new Map<string, PullOutput["events"][number]["flags"]>(),
    // Applied to the next push only.
    dropResponse: false,
    failBefore: false,
    answerOnly: null as number | null,
    refuse: new Map<string, string>(),
    transport: null as unknown as Transport,
  };
  const snapshot = (): PullOutput => ({
    serverNow: new Date(T0),
    me: { id: ME, role: "worker", name: "Luis" },
    company: { name: "Co", timezone: "America/New_York" },
    scheduleEnforced: false,
    shifts: [],
    jobs: [],
    sessions: [],
    events: [...accepted.keys()].map((id) => ({
      id,
      type: "started",
      jobId: JOB,
      clientTimestamp: new Date(T0),
      serverTimestamp: new Date(T0),
      clockSkewed: false,
      correctsEventId: null,
      voidsEventId: null,
      flags: s.flagged.get(id) ?? [],
    })),
  });
  s.transport = {
    status: () =>
      s.statusDown ? Promise.reject(new Error("offline")) : Promise.resolve(s.state),
    push: ({ records }) => {
      s.pushes.push(records.map((r) => r.id));
      if (s.failBefore) {
        s.failBefore = false;
        return Promise.reject(new Error("no route"));
      }
      const taken = s.answerOnly === null ? records : records.slice(0, s.answerOnly);
      s.answerOnly = null;
      const results: PushAnswer[] = taken.map((r) => {
        const code = s.refuse.get(r.id);
        if (code !== undefined) return { id: r.id, result: "rejected", code };
        const seen = accepted.has(r.id);
        accepted.set(r.id, (accepted.get(r.id) ?? 0) + 1);
        return {
          id: r.id,
          result: seen ? "duplicate" : "accepted",
          reasons: s.flagged.get(r.id) ?? [],
        };
      });
      if (s.dropResponse) {
        s.dropResponse = false;
        return Promise.reject(new Error("response lost"));
      }
      return Promise.resolve({ clockSkewMs: 0, results });
    },
    pull: () =>
      s.pullDown ? Promise.reject(new Error("offline")) : Promise.resolve(snapshot()),
  };
  return s;
}

async function phone() {
  const store = memoryStore();
  const srv = server();
  let clock = T0;
  const now = () => clock;
  const mint = createMinter((n) => new Uint8Array(n).fill(7));
  // The first cycle of a sign-in: nothing to push, the pull says who this is.
  await runCycle(store, srv.transport, now);
  const capture = async (count: number) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      clock += 1000;
      const records = recordsFor(
        { action: "start", jobId: JOB },
        { status: "off" },
        { me: ME, now: clock, reading: null, location: null, mint },
      );
      await store.append(records);
      ids.push(...records.map((r) => r.id));
    }
    return ids;
  };
  return {
    store,
    srv,
    now,
    capture,
    advance: (ms: number) => (clock += ms),
    cycle: () => runCycle(store, srv.transport, now),
    standing: (id: string) => store.rows.find((r) => r.id === id)?.standing,
  };
}

describe("a cycle", () => {
  it("pushes oldest first, settles what the server took, then pulls", async () => {
    const p = await phone();
    const ids = await p.capture(3);
    const result = await p.cycle();
    expect(result).toMatchObject({
      outcome: "synced",
      settled: 3,
      drained: true,
      pulled: true,
    });
    expect(p.srv.pushes).toEqual([ids]);
    // The pull showed them, so the phone's copies are gone.
    expect(p.store.rows).toEqual([]);
    expect((await readSnapshot(p.store))?.data.events.map((e) => e.id)).toEqual(ids);
  });

  it("leaves one row on the server and one settled record when a response is lost", async () => {
    const p = await phone();
    const [id] = await p.capture(1);
    p.srv.dropResponse = true;
    p.srv.pullDown = true;
    expect(await p.cycle()).toMatchObject({
      outcome: "synced",
      settled: 0,
      drained: false,
    });
    expect(p.standing(id!)).toBe("pending");
    expect(p.srv.accepted.get(id!)).toBe(1);

    const again = await p.cycle();
    expect(again).toMatchObject({ settled: 1, rejected: 0, drained: true });
    // Sent twice under one id; the second answer was `duplicate`, which settles.
    expect(p.srv.pushes).toEqual([[id], [id]]);
    expect(p.srv.accepted.size).toBe(1);
    expect(p.standing(id!)).toBe("settled");
  });

  it("retries a record the answer left out, under the same id", async () => {
    const p = await phone();
    const ids = await p.capture(3);
    p.srv.answerOnly = 1;
    p.srv.pullDown = true;
    expect(await p.cycle()).toMatchObject({ settled: 1, drained: false });
    expect(ids.map(p.standing)).toEqual(["settled", "pending", "pending"]);
    await p.cycle();
    expect(p.srv.pushes).toEqual([ids, ids.slice(1)]);
    expect(ids.map(p.standing)).toEqual(["settled", "settled", "settled"]);
  });

  it("keeps a rejected record, says why, and never sends it again", async () => {
    const p = await phone();
    const ids = await p.capture(2);
    p.srv.refuse.set(ids[0]!, "time_in_future");
    expect(await p.cycle()).toMatchObject({ settled: 1, rejected: 1, drained: true });
    const kept = p.store.rows.find((r) => r.id === ids[0]);
    expect(kept).toMatchObject({ standing: "rejected", code: "time_in_future" });
    await p.cycle();
    await p.cycle();
    expect(p.srv.pushes).toEqual([ids]);
    expect(p.store.rows.map((r) => r.id)).toEqual([ids[0]]);
  });

  it("drops a flagged record like any other once the snapshot shows it, flags and all", async () => {
    const p = await phone();
    const [id] = await p.capture(1);
    p.srv.flagged.set(id!, ["offline", "unscheduled"]);
    // Acknowledged but not yet pulled: the phone's copy holds why it was flagged.
    p.srv.pullDown = true;
    await p.cycle();
    expect(p.store.rows).toMatchObject([
      { id, standing: "settled", reasons: ["offline", "unscheduled"] },
    ]);
    // Pulled: nothing waits on the office, so the copy goes and the snapshot says the flags.
    p.srv.pullDown = false;
    await p.cycle();
    expect(p.srv.pushes).toEqual([[id]]);
    expect(p.store.rows).toEqual([]);
    expect((await readSnapshot(p.store))?.data.events).toMatchObject([
      { id, flags: ["offline", "unscheduled"] },
    ]);
  });

  it("marks nothing rejected or lost when the network fails", async () => {
    const p = await phone();
    const ids = await p.capture(2);
    p.srv.statusDown = true;
    expect(await p.cycle()).toEqual({ outcome: "unreachable" });
    expect(p.srv.pushes).toEqual([]);
    p.srv.statusDown = false;
    p.srv.failBefore = true;
    expect(await p.cycle()).toMatchObject({
      outcome: "synced",
      settled: 0,
      drained: false,
    });
    expect(ids.map(p.standing)).toEqual(["pending", "pending"]);
    expect(await p.cycle()).toMatchObject({ settled: 2, drained: true });
  });

  it("sends a backlog larger than one batch in order, once each", async () => {
    const p = await phone();
    const ids = await p.capture(230);
    expect(await p.cycle()).toMatchObject({ settled: 230, drained: true });
    expect(p.srv.pushes.map((b) => b.length)).toEqual([100, 100, 30]);
    expect(p.srv.pushes.flat()).toEqual(ids);
    expect([...p.srv.accepted.values()].every((n) => n === 1)).toBe(true);
  });

  it("reclaims a record left syncing by a cycle that never finished", async () => {
    const p = await phone();
    const [id] = await p.capture(1);
    await p.store.claim([id!], p.now());
    p.advance(RECLAIM_MS - 1);
    await p.cycle();
    expect(p.srv.pushes).toEqual([]);
    p.advance(1);
    expect(await p.cycle()).toMatchObject({ settled: 1 });
    expect(p.srv.pushes).toEqual([[id]]);
  });

  it("sends only the signed-in person's records", async () => {
    const p = await phone();
    const [mine] = await p.capture(1);
    await p.store.append([
      {
        id: "01900000-0000-7000-8000-0000000000ff",
        ownerId: "01900000-0000-7000-8000-000000000002",
        payload: p.store.rows[0]!.payload,
      },
    ]);
    await p.cycle();
    expect(p.srv.pushes).toEqual([[mine]]);
    expect(p.standing("01900000-0000-7000-8000-0000000000ff")).toBe("pending");
  });
});

describe("the first cycle after a sign-in", () => {
  it("pulls to learn who this is, then sends what that person left on the phone", async () => {
    const p = await phone();
    const ids = await p.capture(2);
    // Signed out and in again: the snapshot is gone, the outbox is not.
    await p.store.write("snapshot", null);
    expect(await p.cycle()).toMatchObject({ settled: 2, drained: true, pulled: true });
    expect(p.srv.pushes).toEqual([ids]);
  });

  it("sends nothing while it cannot learn who this is", async () => {
    const p = await phone();
    await p.capture(1);
    await p.store.write("snapshot", null);
    p.srv.pullDown = true;
    expect(await p.cycle()).toMatchObject({ settled: 0, pulled: false });
    expect(p.srv.pushes).toEqual([]);
  });
});

describe("the service's state", () => {
  it.each(["paused", "update_required"] as const)(
    "holds everything under %s and delivers every record once after it",
    async (state) => {
      const p = await phone();
      const ids = await p.capture(3);
      p.srv.answerOnly = 1;
      p.srv.pullDown = true;
      await p.cycle();
      p.srv.pullDown = false;
      const before = (await readSnapshot(p.store))?.pulledAt;

      p.srv.state = state;
      expect(await p.cycle()).toEqual({ outcome: "held", state });
      expect(await p.cycle()).toEqual({ outcome: "held", state });
      expect(p.srv.pushes).toHaveLength(1);
      expect(ids.map(p.standing)).toEqual(["settled", "pending", "pending"]);
      expect((await readSnapshot(p.store))?.pulledAt).toBe(before);

      p.srv.state = "normal";
      expect(await p.cycle()).toMatchObject({ settled: 2, rejected: 0, drained: true });
      expect([...p.srv.accepted.values()]).toEqual([1, 1, 1]);
    },
  );

  it("pulls and keeps the outbox under read_only", async () => {
    const p = await phone();
    const ids = await p.capture(2);
    p.srv.state = "read_only";
    expect(await p.cycle()).toMatchObject({
      outcome: "synced",
      state: "read_only",
      settled: 0,
      drained: false,
      pulled: true,
    });
    expect(p.srv.pushes).toEqual([]);
    expect(ids.map(p.standing)).toEqual(["pending", "pending"]);
    p.srv.state = "normal";
    expect(await p.cycle()).toMatchObject({ settled: 2, drained: true });
  });
});

describe("the reachability reading", () => {
  it("is the last time the API answered, and is not moved by a failure", async () => {
    const p = await phone();
    expect(p.store.kv.get(READING_KEY)).toBe(String(T0));
    p.advance(5000);
    p.srv.statusDown = true;
    await p.cycle();
    expect(p.store.kv.get(READING_KEY)).toBe(String(T0));
    p.srv.statusDown = false;
    await p.cycle();
    expect(p.store.kv.get(READING_KEY)).toBe(String(T0 + 5000));
  });
});

describe("coalesced triggers", () => {
  it("never runs two cycles at once, and one more after any number of requests", async () => {
    let active = 0;
    let most = 0;
    let runs = 0;
    const gates: (() => void)[] = [];
    const request = createSyncer(async () => {
      active += 1;
      most = Math.max(most, active);
      runs += 1;
      const mine = runs;
      await new Promise<void>((done) => gates.push(done));
      active -= 1;
      return mine;
    });
    const first = request();
    const second = request();
    const third = request();
    const fourth = request();
    expect(second).toBe(third);
    expect(third).toBe(fourth);
    gates.shift()!();
    expect(await first).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    gates.shift()!();
    // A caller that asked mid-cycle is answered by the cycle that began after it asked.
    expect(await fourth).toBe(2);
    expect({ runs, most }).toEqual({ runs: 2, most: 1 });
    const later = request();
    gates.shift()!();
    expect(await later).toBe(3);
  });

  it("runs again after a cycle that threw", async () => {
    let n = 0;
    const request = createSyncer(() => {
      n += 1;
      return n === 1 ? Promise.reject(new Error("boom")) : Promise.resolve(n);
    });
    await expect(request()).rejects.toThrow("boom");
    expect(await request()).toBe(2);
  });
});
