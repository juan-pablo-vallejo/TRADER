// demo.signIn: a ticket for an active person of the one company the host names, given
// that person's number and the code; one refusal for everything else, and no ticket ever
// asked of the provider for anybody the door does not admit.
import { users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createContext } from "../../src/core/context";
import type { DemoDoor } from "../../src/core/demo-door";
import { localDirectory } from "../../src/core/identity";
import { appRouter } from "../../src/router";
import { createCallerFactory } from "../../src/core/trpc";
import {
  appDb,
  member,
  outcome,
  ownerDb,
  recordingReporter,
  REQUEST_ID,
  testPhone,
  userCount,
  world,
  type World,
} from "../helpers";

const owner = ownerDb();
const app = appDb({ max: 4 });
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

const CODE = "a-long-demo-code-0123456789";

// A person of company `a` or `b` who signs in with a number.
async function personWith(company: "a" | "b", opts: { deactivated?: boolean } = {}) {
  const phone = testPhone();
  const person = await member(owner, w, company, "worker", {
    label: phone.slice(-4),
    ...opts,
  });
  await owner.update(users).set({ signInPhone: phone }).where(eq(users.id, person.id));
  return { ...person, phone };
}

// The door of company `a`, recording every number a ticket was asked for.
function door(over: Partial<DemoDoor> = {}) {
  const asked: string[] = [];
  const it: DemoDoor = {
    code: CODE,
    companyId: w.a.companyId,
    ticket: (phone) => {
      asked.push(phone);
      return Promise.resolve(`ticket-for-${phone}`);
    },
    ...over,
  };
  return { it, asked };
}

function signIn(demo: DemoDoor | null, reporter = recordingReporter()) {
  const caller = createCallerFactory(appRouter)(
    createContext({
      directory: localDirectory,
      db: app,
      identity: null,
      demo,
      reporter: reporter.reporter,
      requestId: REQUEST_ID,
    }),
  );
  return {
    call: (input: { phone: string; code: string }) => caller.demo.signIn(input),
    reports: reporter.events,
  };
}

// The same caller as an admin of company `a`, on a host that names a closed company or none.
function office(who: unknown, closed: { companyId: string; allowed: string[] } | null) {
  const directory = { admitted: [] as string[] };
  const caller = createCallerFactory(appRouter)(
    createContext({
      directory: {
        ...localDirectory,
        admit: (person) => {
          directory.admitted.push(person.phone ?? "");
          return Promise.resolve();
        },
      },
      db: app,
      identity: who,
      closed,
      reporter: recordingReporter().reporter,
      requestId: REQUEST_ID,
    }),
  );
  return { caller, admitted: directory.admitted };
}

describe("the closed company: the door's, in production", () => {
  it("invites nobody: refused before a row is written or the provider is told", async () => {
    const admin = await member(owner, w, "a", "admin");
    const before = await userCount(owner, [w.a.companyId]);
    const closed = office(admin.who, { companyId: w.a.companyId, allowed: [] });
    expect(
      await closed.caller.roster.invite({ phone: testPhone(), name: "Anyone" }),
    ).toEqual({ result: "rejected", code: "company_closed" });
    expect(closed.admitted).toEqual([]);
    expect(await userCount(owner, [w.a.companyId])).toEqual(before);
  });

  it("leaves every other company, and a host with no closed company, inviting as before", async () => {
    const admin = await member(owner, w, "a", "admin");
    // Staging, a development machine: nobody is closed.
    const open = office(admin.who, null);
    const first = testPhone();
    expect(await open.caller.roster.invite({ phone: first, name: "One" })).toMatchObject({
      result: "invited",
    });
    // Production, where the closed company is another one: D Sierra invites freely.
    const other = office(admin.who, { companyId: w.b.companyId, allowed: [] });
    const second = testPhone();
    expect(
      await other.caller.roster.invite({ phone: second, name: "Two" }),
    ).toMatchObject({ result: "invited" });
    expect([...open.admitted, ...other.admitted]).toEqual([first, second]);
  });
});

describe("demo.signIn", () => {
  it("answers a ticket for a Demo person's number and the code, with no session", async () => {
    const person = await personWith("a");
    const d = door();
    expect(await signIn(d.it).call({ phone: person.phone, code: CODE })).toEqual({
      result: "ticket",
      ticket: `ticket-for-${person.phone}`,
    });
    expect(d.asked).toEqual([person.phone]);
  });

  it("refuses a wrong code, and asks the provider for nothing", async () => {
    const person = await personWith("a");
    const d = door();
    for (const code of ["wrong", CODE.slice(0, -1), `${CODE} `, CODE.toUpperCase()]) {
      expect(await signIn(d.it).call({ phone: person.phone, code })).toEqual({
        result: "refused",
      });
    }
    expect(d.asked).toEqual([]);
  });

  it("refuses everybody who is not an active person of the door's company, code or not", async () => {
    const d = door();
    const elsewhere = await personWith("b");
    const gone = await personWith("a", { deactivated: true });
    for (const phone of [elsewhere.phone, gone.phone, testPhone()]) {
      expect(await signIn(d.it).call({ phone, code: CODE })).toEqual({
        result: "refused",
      });
    }
    // The other company's person is admitted by a door of their own company only.
    const theirs = door({ companyId: w.b.companyId });
    expect(
      await signIn(theirs.it).call({ phone: elsewhere.phone, code: CODE }),
    ).toMatchObject({ result: "ticket" });
    expect(d.asked).toEqual([]);
  });

  it("refuses everyone on a host with no door", async () => {
    const person = await personWith("a");
    expect(await signIn(null).call({ phone: person.phone, code: CODE })).toEqual({
      result: "refused",
    });
  });

  it("refuses when the provider has no ticket, and reports it when the provider fails", async () => {
    const person = await personWith("a");
    const none = signIn(door({ ticket: () => Promise.resolve(null) }).it);
    expect(await none.call({ phone: person.phone, code: CODE })).toEqual({
      result: "refused",
    });
    expect(none.reports).toEqual([]);
    const failing = signIn(
      door({ ticket: () => Promise.reject(new Error("provider down")) }).it,
    );
    expect(await failing.call({ phone: person.phone, code: CODE })).toEqual({
      result: "refused",
    });
    expect(failing.reports).toHaveLength(1);
    // The report names the procedure and neither the number nor the code.
    expect(JSON.stringify(failing.reports)).not.toContain(person.phone);
    expect(JSON.stringify(failing.reports)).not.toContain(CODE);
  });

  it("takes a number in the stored form only, and a code of bounded length", async () => {
    const d = door();
    const call = signIn(d.it).call;
    for (const input of [
      { phone: "4015550100", code: CODE },
      { phone: "+44 20 7946 0000", code: CODE },
      { phone: "+14015550100", code: "" },
      { phone: "+14015550100", code: "x".repeat(129) },
    ]) {
      expect(await outcome(call(input))).toBe("BAD_REQUEST");
    }
    expect(d.asked).toEqual([]);
  });
});
