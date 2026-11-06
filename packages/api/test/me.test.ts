// Stage 3 line 1b: me.get, the first procedure on the app router, through the package's own
// entry point.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { appRouter, createCallerFactory, createContext } from "../src/index";
import {
  appDb,
  identity,
  outcome,
  ownerDb,
  quietReporter,
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

const me = (who: unknown) =>
  createCallerFactory(appRouter)(
    createContext({ db: app, identity: who, reporter: quietReporter }),
  ).me.get();

describe("me.get", () => {
  it("returns the caller's own record, narrowed", async () => {
    expect(await me(identity(w.a.boundSubject, w.a.boundEmail))).toStrictEqual({
      id: w.a.boundId,
      companyId: w.a.companyId,
      role: "worker",
      name: "Bound a",
      email: w.a.boundEmail,
      phone: null,
    });
  });

  it("returns an invitee's record on first sign-in", async () => {
    const record = await me(identity(`sub-new-${w.run}`, w.a.inviteEmail));
    expect(record.id).toBe(w.a.inviteId);
    expect(record.companyId).toBe(w.a.companyId);
  });

  it("refuses an anonymous caller", async () => {
    expect(await outcome(me(null))).toBe("UNAUTHORIZED");
  });
});
