// company.get and company.update: the caller's own company, admin only; a key given is
// written and a key left out is left alone; blank text is NULL; the zone is never written;
// another company's row is never touched; a caller deactivated or demoted mid-call is
// refused and writes nothing.
import { companies, users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
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

const company = (who: unknown) => appCaller(app, who).company;
const row = async (id: string) =>
  (await owner.select().from(companies).where(eq(companies.id, id)))[0]!;

describe("company.get", () => {
  it("answers the caller's own company with its defaults", async () => {
    const admin = await member(owner, w, "a", "admin");
    const before = await row(w.a.companyId);
    expect(await company(admin.who).get()).toStrictEqual({
      name: before.name,
      timezone: "America/New_York",
      address: null,
      phone: null,
      email: null,
      paymentInstructions: null,
      // Due on receipt, and stamped, until the office says otherwise.
      invoiceTermsDays: 0,
      scheduleEnforced: false,
      locationStamps: true,
    });
  });

  it("answers 401, 403 and 200 over HTTP", async () => {
    const send = async (who: unknown) => {
      const r = await http(app, who, [{ path: "company.get" }], { router: appRouter });
      return { status: r.status, ...failure(r.results[0]) };
    };
    expect(await send(null)).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    const worker = await member(owner, w, "a", "worker");
    expect(await send(worker.who)).toMatchObject({ status: 403, code: "FORBIDDEN" });
    const admin = await member(owner, w, "a", "admin");
    expect((await send(admin.who)).status).toBe(200);
  });
});

describe("company.update", () => {
  it("writes the details an invoice prints, blank text as NULL", async () => {
    const admin = await member(owner, w, "a", "admin");
    const answer = await company(admin.who).update({
      name: " D Sierra Painting ",
      address: "1 Main St\nProvidence, RI",
      phone: " 401-555-0100 ",
      email: "office@dsierra.test",
      paymentInstructions: "Check payable to D Sierra Painting.\nZelle: 401-555-0100",
      invoiceTermsDays: 15,
    });
    expect(answer).toMatchObject({
      name: "D Sierra Painting",
      address: "1 Main St\nProvidence, RI",
      phone: "401-555-0100",
      email: "office@dsierra.test",
      paymentInstructions: "Check payable to D Sierra Painting.\nZelle: 401-555-0100",
      invoiceTermsDays: 15,
      scheduleEnforced: false,
      locationStamps: true,
    });
    expect(await row(w.a.companyId)).toMatchObject({
      name: "D Sierra Painting",
      phone: "401-555-0100",
      invoiceTermsDays: 15,
    });
    const blanked = await company(admin.who).update({
      address: "  ",
      phone: "",
      email: " ",
      paymentInstructions: null,
    });
    expect(blanked).toMatchObject({
      address: null,
      phone: null,
      email: null,
      paymentInstructions: null,
      // Left out, so left alone.
      name: "D Sierra Painting",
      invoiceTermsDays: 15,
    });
  });

  it("flips one switch and leaves everything else as it was", async () => {
    const admin = await member(owner, w, "a", "admin");
    await company(admin.who).update({ phone: "401-555-0100", invoiceTermsDays: 30 });
    const enforced = await company(admin.who).update({ scheduleEnforced: true });
    expect(enforced).toMatchObject({
      scheduleEnforced: true,
      locationStamps: true,
      phone: "401-555-0100",
      invoiceTermsDays: 30,
    });
    const unstamped = await company(admin.who).update({ locationStamps: false });
    expect(unstamped).toMatchObject({ scheduleEnforced: true, locationStamps: false });
    expect(await row(w.a.companyId)).toMatchObject({
      scheduleEnforced: true,
      locationStamps: false,
    });
    // The other company's row is its own.
    expect(await row(w.b.companyId)).toMatchObject({
      scheduleEnforced: false,
      locationStamps: true,
      phone: null,
    });
  });

  it("refuses the zone, an unknown key, nothing at all, and values out of range", async () => {
    const admin = await member(owner, w, "a", "admin");
    const before = await row(w.a.companyId);
    const bad: unknown[] = [
      {},
      { timezone: "America/Chicago" },
      { name: "X", id: w.b.companyId },
      { name: "  " },
      { invoiceTermsDays: -1 },
      { invoiceTermsDays: 366 },
      { invoiceTermsDays: 1.5 },
      { email: "not an address" },
      { scheduleEnforced: "yes" },
      { paymentInstructions: "x".repeat(2001) },
    ];
    for (const input of bad) {
      expect(
        await outcome(company(admin.who).update(input as never)),
        JSON.stringify(input),
      ).toBe("BAD_REQUEST");
    }
    expect(await row(w.a.companyId)).toStrictEqual(before);
  });

  it("is the admin's alone, and a caller deactivated or demoted is refused", async () => {
    const before = await row(w.a.companyId);
    const worker = await member(owner, w, "a", "worker");
    expect(await outcome(company(worker.who).update({ scheduleEnforced: true }))).toBe(
      "FORBIDDEN",
    );
    expect(await outcome(company(null).update({ scheduleEnforced: true }))).toBe(
      "UNAUTHORIZED",
    );
    const gone = await member(owner, w, "a", "admin", { deactivated: true });
    expect(await outcome(company(gone.who).update({ scheduleEnforced: true }))).toBe(
      "UNAUTHORIZED",
    );
    const admin = await member(owner, w, "a", "admin");
    await owner.update(users).set({ role: "worker" }).where(eq(users.id, admin.id));
    expect(await outcome(company(admin.who).update({ scheduleEnforced: true }))).toBe(
      "FORBIDDEN",
    );
    expect(await row(w.a.companyId)).toStrictEqual(before);
  });
});
