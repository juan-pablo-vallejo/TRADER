// TASKS:45: roster.list — every user of the caller's company and none of another's, ordered
// by name, with invited and deactivated state; admin only, through the real gates.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { appRouter } from "../../src/router";
import {
  appCaller,
  appDb,
  failure,
  http,
  member,
  outcome,
  ownerDb,
  world,
  type World,
} from "../helpers";

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

const list = (who: unknown) => appCaller(app, who).roster.list();

describe("roster.list", () => {
  it("lists the caller's company by name, invited and deactivated state included", async () => {
    const admin = await member(owner, w, "a", "admin");
    const off = await member(owner, w, "a", "worker", { deactivated: true });
    const rows = await list(admin.who);
    expect(rows.map((r) => r.name)).toEqual(
      [...rows.map((r) => r.name)].sort((x, y) =>
        x.toLowerCase().localeCompare(y.toLowerCase()),
      ),
    );
    expect(rows.map((r) => r.id).sort()).toEqual(
      [w.a.boundId, w.a.inviteId, admin.id, off.id].sort(),
    );
    expect(rows.find((r) => r.id === w.a.inviteId)).toStrictEqual({
      id: w.a.inviteId,
      name: "Invite a",
      email: w.a.inviteEmail,
      phone: null,
      signInPhone: null,
      role: "worker",
      invited: true,
      deactivatedAt: null,
      currentRate: null,
    });
    expect(rows.find((r) => r.id === w.a.boundId)).toMatchObject({ invited: false });
    expect(rows.find((r) => r.id === admin.id)).toMatchObject({ role: "admin" });
    expect(rows.find((r) => r.id === off.id)!.deactivatedAt).toBeInstanceOf(Date);
    expect(rows.map((r) => r.id)).not.toContain(w.b.boundId);
  });

  it("is admin only: FORBIDDEN for a worker or foreman, UNAUTHORIZED otherwise", async () => {
    for (const role of ["worker", "foreman"] as const) {
      const { who } = await member(owner, w, "a", role);
      expect([role, await outcome(list(who))]).toEqual([role, "FORBIDDEN"]);
    }
    expect(await outcome(list(null))).toBe("UNAUTHORIZED");
    const off = await member(owner, w, "a", "admin", { deactivated: true });
    expect(await outcome(list(off.who))).toBe("UNAUTHORIZED");
  });

  it("answers 401, 403 and 200 over HTTP", async () => {
    const send = async (who: unknown) => {
      const r = await http(app, who, [{ path: "roster.list" }], { router: appRouter });
      return { status: r.status, ...failure(r.results[0]) };
    };
    expect(await send(null)).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    const worker = await member(owner, w, "a", "worker");
    expect(await send(worker.who)).toMatchObject({ status: 403, code: "FORBIDDEN" });
    const admin = await member(owner, w, "a", "admin");
    expect((await send(admin.who)).status).toBe(200);
  });
});
