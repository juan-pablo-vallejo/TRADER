// me.update — an admin edits their own name and phone, those two columns only, and nothing
// else about the row moves; a worker's name is the office's, so a worker is FORBIDDEN; a
// deactivated or anonymous caller is UNAUTHORIZED.
import { users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appCaller,
  appDb,
  member,
  outcome,
  ownerDb,
  testPhone,
  userRow,
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

type Input = Parameters<ReturnType<typeof appCaller>["me"]["update"]>[0];
const update = (who: unknown, input: Input) => appCaller(app, who).me.update(input);

describe("me.update", () => {
  it("writes an admin's own name and phone, and nothing else", async () => {
    for (const role of ["admin"] as const) {
      const m = await member(owner, w, "a", role);
      const before = await userRow(owner, m.id);
      const answer = await update(m.who, {
        name: `  ${role} renamed `,
        phone: " 401-555-0100 ",
      });
      expect(answer).toStrictEqual({
        id: m.id,
        companyId: w.a.companyId,
        role,
        name: `${role} renamed`,
        email: before!.email,
        phone: "401-555-0100",
        signInPhone: null,
      });
      const after = await userRow(owner, m.id);
      expect({
        ...after,
        name: before!.name,
        phone: before!.phone,
        updated_at: before!.updated_at,
      }).toEqual(before);
      expect(after).toMatchObject({ name: `${role} renamed`, phone: "401-555-0100" });
      expect((await appCaller(app, m.who).me.get()).phone).toBe("401-555-0100");
    }
  });

  it("refuses a worker, whose name is the office's, and changes nothing", async () => {
    const m = await member(owner, w, "a", "worker");
    const before = await userRow(owner, m.id);
    expect(await outcome(update(m.who, { name: "Renamed", phone: null }))).toBe(
      "FORBIDDEN",
    );
    expect(await userRow(owner, m.id)).toEqual(before);
  });

  it("stores an empty or null phone as NULL and refuses a blank name or a foreign field", async () => {
    const m = await member(owner, w, "a", "admin");
    expect((await update(m.who, { name: "Name", phone: "" })).phone).toBeNull();
    expect((await update(m.who, { name: "Name", phone: null })).phone).toBeNull();
    for (const input of [
      { name: "  ", phone: null },
      { name: "Name", phone: null, email: "other@co.test" },
      { name: "Name", phone: null, role: "admin" },
      { name: "Name", phone: null, signInPhone: "+14015550123" },
      { name: "Name" },
    ]) {
      expect(await outcome(update(m.who, input as Input))).toBe("BAD_REQUEST");
    }
    expect(await userRow(owner, m.id)).toMatchObject({ role: "admin" });
  });

  it("cannot change a number that is a binding key", async () => {
    const m = await member(owner, w, "a", "admin");
    const signInPhone = testPhone();
    await owner.update(users).set({ signInPhone }).where(eq(users.id, m.id));
    // Not in the input at all, and the contact phone is another column.
    expect(
      await outcome(
        update(m.who, { name: "Name", phone: null, signInPhone: testPhone() } as Input),
      ),
    ).toBe("BAD_REQUEST");
    const answered = await update(m.who, { name: "Name", phone: "401-555-0199" });
    expect(answered).toMatchObject({ phone: "401-555-0199", signInPhone });
    expect(await userRow(owner, m.id)).toMatchObject({
      phone: "401-555-0199",
      sign_in_phone: signInPhone,
    });
  });

  it("never touches another row, even on first sign-in", async () => {
    const before = await userRow(owner, w.a.boundId);
    const invited = await userRow(owner, w.a.inviteId);
    const who = {
      subject: `sub-new-${w.run}`,
      email: w.a.inviteEmail,
      emailVerified: true,
    };
    // The invitee is a worker: refused, and the whole call with it.
    expect(await outcome(update(who, { name: "Invitee", phone: null }))).toBe(
      "FORBIDDEN",
    );
    expect(await userRow(owner, w.a.boundId)).toEqual(before);
    expect(await userRow(owner, w.a.inviteId)).toEqual(invited);
  });

  it("is UNAUTHORIZED anonymous or deactivated", async () => {
    expect(await outcome(update(null, { name: "X", phone: null }))).toBe("UNAUTHORIZED");
    const off = await member(owner, w, "a", "admin", { deactivated: true });
    expect(await outcome(update(off.who, { name: "X", phone: null }))).toBe(
      "UNAUTHORIZED",
    );
    expect(await userRow(owner, off.id)).toMatchObject({
      name: `Member admin-off-a-${w.run}`,
    });
  });
});
