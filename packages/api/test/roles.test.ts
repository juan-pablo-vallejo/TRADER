// Stage 3 line 2: role gates, against the real database as trader_app. A gate admits the roles
// it lists and nothing else; a deactivated account is refused exactly like an anonymous caller,
// before any gate runs; a denial is FORBIDDEN, rolls back, and names no role.
import { users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDevIdentityAdapter,
  DEV_EMAIL_HEADER,
  DEV_SUBJECT_HEADER,
} from "../src/index";
import {
  appDb,
  caller,
  customerNames,
  failure,
  GATES,
  http,
  identity,
  member,
  outcome,
  ownerDb,
  userRow,
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

type Gate = (typeof GATES)[number];
const call = (who: unknown, gate: Gate) => caller(app, who).gate[gate]();

const UNAUTHORIZED = {
  status: 401,
  code: "UNAUTHORIZED",
  message: "Sign-in required.",
  httpStatus: 401,
};
const FORBIDDEN = {
  status: 403,
  code: "FORBIDDEN",
  message: "Not permitted.",
  httpStatus: 403,
};

// One unbatched request, so the response status is this call's own.
async function single(who: unknown, path: string) {
  const {
    status,
    results: [r],
  } = await http(app, who, [{ path }]);
  return { status, ...failure(r) };
}

// The matrix: what each active role gets at each gate.
const ADMITTED: Record<"worker" | "foreman" | "admin", Record<Gate, boolean>> = {
  worker: { protected: true, field: true, foreman: false, admin: false, office: false },
  foreman: { protected: true, field: true, foreman: true, admin: false, office: true },
  admin: { protected: true, field: false, foreman: false, admin: true, office: true },
};

describe("role gates", () => {
  for (const role of ["worker", "foreman", "admin"] as const) {
    it(`admit each role at exactly its gates (${role}) and refuse it with FORBIDDEN elsewhere`, async () => {
      const { who } = await member(owner, w, "a", role);
      for (const gate of GATES) {
        expect([gate, await outcome(call(who, gate))]).toEqual([
          gate,
          ADMITTED[role][gate] ? "OK" : "FORBIDDEN",
        ]);
      }
    });
  }

  it("run as the resolved user and its tenant", async () => {
    const { who } = await member(owner, w, "a", "admin");
    expect(await call(who, "admin")).toEqual({
      role: "admin",
      company: w.a.companyId,
      customers: [w.a.customerId],
    });
  });

  it("judge the role as it is now, not as it was at an earlier call", async () => {
    const { id, who } = await member(owner, w, "a", "worker");
    expect(await outcome(call(who, "admin"))).toBe("FORBIDDEN");
    await owner.update(users).set({ role: "admin" }).where(eq(users.id, id));
    expect(await outcome(call(who, "admin"))).toBe("OK");
    await owner.update(users).set({ role: "worker" }).where(eq(users.id, id));
    expect(await outcome(call(who, "admin"))).toBe("FORBIDDEN");
  });
});

// No identity, then a deactivated worker, foreman and admin.
async function anonymousAndDeactivated() {
  const deactivated = [];
  for (const role of ["worker", "foreman", "admin"] as const) {
    deactivated.push((await member(owner, w, "a", role, { deactivated: true })).who);
  }
  return [null, ...deactivated];
}

describe("a deactivated account, exactly like an anonymous one", () => {
  it("is refused UNAUTHORIZED at every gate, whatever its role", async () => {
    const callers = await anonymousAndDeactivated();
    for (const who of callers) {
      for (const gate of GATES) {
        expect([gate, await outcome(call(who, gate))]).toEqual([gate, "UNAUTHORIZED"]);
      }
    }
  });

  it("gets the same status, code and message over HTTP, one request each", async () => {
    const callers = await anonymousAndDeactivated();
    for (const who of callers) {
      for (const path of ["gate.admin", "gate.foreman", "gate.protected"]) {
        expect([path, await single(who, path)]).toEqual([path, UNAUTHORIZED]);
      }
    }
  });
});

describe("a denial", () => {
  it("is FORBIDDEN with one message that names no role, distinct from sign-in", async () => {
    const worker = (await member(owner, w, "a", "worker")).who;
    const foreman = (await member(owner, w, "a", "foreman")).who;
    for (const [who, path] of [
      [worker, "gate.admin"],
      [worker, "gate.foreman"],
      [foreman, "gate.admin"],
    ] as const) {
      const answer = await single(who, path);
      expect([path, answer]).toEqual([path, FORBIDDEN]);
      expect(answer.message).not.toMatch(/admin|foreman|worker/i);
    }
  });

  it("keeps nothing an admitted procedure wrote before failing", async () => {
    const { who } = await member(owner, w, "a", "admin");
    expect(
      await outcome(
        caller(app, who).gate.adminWrite({ name: "Rolled back", fail: true }),
      ),
    ).toBe("INTERNAL_SERVER_ERROR");
    await caller(app, who).gate.adminWrite({ name: "Committed", fail: false });
    expect(await customerNames(owner, w.a.companyId)).toEqual([
      "Committed",
      "Customer a",
    ]);
  });

  it("rolls back a first-sign-in bind", async () => {
    // The invitation is a worker: the bind happens, then the admin gate refuses.
    const who = identity(`sub-new-${w.run}`, w.a.inviteEmail);
    expect(await outcome(call(who, "admin"))).toBe("FORBIDDEN");
    expect(await userRow(owner, w.a.inviteId)).toMatchObject({ identity_subject: null });
  });

  it("fails only its own call in a batch", async () => {
    const worker = (await member(owner, w, "a", "worker")).who;
    const { results } = await http(app, worker, [
      { path: "gate.admin" },
      { path: "gate.protected" },
    ]);
    expect(results.map((r) => (r.error ? r.error.json.data.code : "OK"))).toEqual([
      "FORBIDDEN",
      "OK",
    ]);
  });
});

describe("client claims", () => {
  it("an identity carrying a role or company grants neither", async () => {
    const { who } = await member(owner, w, "a", "worker");
    const claimed = { ...who, role: "admin", companyId: w.b.companyId };
    expect(await outcome(call(claimed, "admin"))).toBe("FORBIDDEN");
    expect(await call(claimed, "protected")).toMatchObject({
      role: "worker",
      company: w.a.companyId,
    });
  });

  it("input carrying a role or company grants neither", async () => {
    const { who } = await member(owner, w, "a", "worker");
    expect(
      await outcome(
        caller(app, who).gate.adminLoose({ role: "admin", companyId: w.b.companyId }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("request headers carrying a role or company grant neither", async () => {
    const { who } = await member(owner, w, "a", "worker");
    const adapter = createDevIdentityAdapter({
      NODE_ENV: "test",
      TRADER_DEV_IDENTITY: "enabled",
    });
    const headers = {
      [DEV_SUBJECT_HEADER]: who.subject,
      [DEV_EMAIL_HEADER]: who.email,
      "x-trader-role": "admin",
      "x-trader-company-id": w.b.companyId,
    };
    const send = (path: string) =>
      http(app, null, [{ path }], { headers, identify: (h) => adapter.identify(h) });
    const denied = await send("gate.admin");
    expect({ status: denied.status, ...failure(denied.results[0]) }).toEqual(FORBIDDEN);
    const admitted = await send("gate.protected");
    expect(admitted.status).toBe(200);
    expect(admitted.results[0]?.result?.data.json).toMatchObject({
      role: "worker",
      company: w.a.companyId,
    });
  });
});

describe("tenant isolation through a gate", () => {
  it("an admin of one company reads none of another's rows", async () => {
    const { who } = await member(owner, w, "a", "admin");
    const seen = await call(who, "admin");
    expect(seen.customers).toEqual([w.a.customerId]);
    expect(seen.customers).not.toContain(w.b.customerId);
    expect(await caller(app, who).probe.customer({ id: w.b.customerId })).toEqual([]);
  });
});
