// An address change against real commits: two admins changing one person at once, and the
// person's own phone sending a clock tap while their address is being changed. Neither can
// be shown inside one rolled-back transaction. A database of its own (helpers.ts,
// disposableDb), dropped at the end with everything committed in it. The provider is a
// stand-in that waits until the test lets it answer, which is where the real one spends
// its time: inside the change's transaction, with the person's row locked.
import { addressChanges, users, workSessionEvents } from "@trader/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext } from "../../src/core/context";
import {
  localDirectory,
  type IdentityDirectory,
  type VerifiedIdentity,
} from "../../src/core/identity";
import { createCallerFactory } from "../../src/core/trpc";
import { appRouter } from "../../src/router";
import {
  boundIn,
  disposableDb,
  quietReporter,
  REQUEST_ID,
  uuidv7,
  waitForLockWait,
  workDayIn,
} from "../helpers";

let D: Awaited<ReturnType<typeof disposableDb>>;
let app: ReturnType<typeof D.app>;

beforeAll(async () => {
  D = await disposableDb();
  app = D.app();
}, 60_000);
afterAll(async () => {
  await D.drop();
});

const caller = (who: VerifiedIdentity, directory: IdentityDirectory = localDirectory) =>
  createCallerFactory(appRouter)(
    createContext({
      directory,
      db: app,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  );

// A provider that says when it has been asked, and answers only when let.
function gated() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  let asked: () => void = () => {};
  const wasAsked = new Promise<void>((resolve) => (asked = resolve));
  const directory: IdentityDirectory = {
    ...localDirectory,
    readdress: async () => {
      asked();
      await opened;
      return "done";
    },
  };
  return { directory, wasAsked, open };
}

// A committed working day with two admins and a bound worker who signs in with a number.
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await workDayIn(tx);
    const first = await boundIn(tx, d.companyId, "admin");
    const second = await boundIn(tx, d.companyId, "admin");
    const w = await boundIn(tx, d.companyId, "worker");
    await tx.update(users).set({ signInPhone: "+14015550170" }).where(eq(users.id, w.id));
    return { ...d, first, second, w };
  });
}

const changesOf = (userId: string) =>
  D.owner
    .select({ from: addressChanges.oldValue, to: addressChanges.newValue })
    .from(addressChanges)
    .where(eq(addressChanges.userId, userId))
    .orderBy(asc(addressChanges.createdAt), asc(addressChanges.id));

describe("an address change, on real commits", () => {
  it("takes two admins' changes of one person one after the other, each recorded from what it found", async () => {
    const d = await world();
    const g = gated();
    const one = caller(
      d.first.who as VerifiedIdentity,
      g.directory,
    ).roster.setSignInPhone({
      userId: d.w.id,
      phone: "+14015550171",
    });
    await g.wasAsked;
    // The first holds the person's row until the provider answers. The second waits on it.
    const two = caller(d.second.who as VerifiedIdentity).roster.setSignInPhone({
      userId: d.w.id,
      phone: "+14015550172",
    });
    await waitForLockWait(D.owner, '%from "users"%for update%');
    g.open();
    expect(await one).toMatchObject({ result: "changed" });
    expect(await two).toMatchObject({
      result: "changed",
      user: { signInPhone: "+14015550172" },
    });
    // The second change is from the first's number, not from the one both saw on screen.
    expect(await changesOf(d.w.id)).toEqual([
      { from: "+14015550170", to: "+14015550171" },
      { from: "+14015550171", to: "+14015550172" },
    ]);
  }, 20_000);

  it("holds a clock tap from the person's own phone until the change is done, and loses none", async () => {
    const d = await world();
    const g = gated();
    const change = caller(d.first.who as VerifiedIdentity, g.directory).roster.setEmail({
      userId: d.w.id,
      email: `moved-${uuidv7()}@crew.test`,
    });
    await g.wasAsked;
    const tap = {
      id: uuidv7(),
      kind: "labor_event" as const,
      schemaVersion: 1,
      payload: {
        workerId: d.w.id,
        jobId: d.J,
        type: "started",
        clientTimestamp: new Date("2026-10-05T12:00:00Z"),
        location: { lat: 41.824, lng: -71.4128, accuracyM: 8 },
        timeSetByUser: false,
        capturedOffline: false,
      },
    };
    const pushed = caller(d.w.who as VerifiedIdentity).sync.push({
      protocolVersion: 1,
      deviceNow: new Date(),
      records: [tap],
    });
    // The tap reads its sender's row under a lock, and the change holds that row.
    await waitForLockWait(D.owner, '%from "users"%for share%');
    g.open();
    expect(await change).toMatchObject({ result: "changed" });
    await pushed;
    const events = await D.owner
      .select({ id: workSessionEvents.id })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.id, tap.id));
    expect(events).toEqual([{ id: tap.id }]);
  }, 20_000);
});
