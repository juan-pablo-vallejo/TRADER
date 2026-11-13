// TASKS:45: me.update — any active role edits its own name and phone, those two columns only,
// and nothing else about the row moves; a deactivated or anonymous caller is UNAUTHORIZED.
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
  it("writes the caller's own name and phone, for every role, and nothing else", async () => {
    for (const role of ["worker", "foreman", "admin"] as const) {
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

  it("stores an empty or null phone as NULL and refuses a blank name or a foreign field", async () => {
    const m = await member(owner, w, "a", "worker");
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
    expect(await userRow(owner, m.id)).toMatchObject({ role: "worker" });
  });

  it("cannot change a number that is a binding key", async () => {
    const m = await member(owner, w, "a", "worker");
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
    const who = {
      subject: `sub-new-${w.run}`,
      email: w.a.inviteEmail,
      emailVerified: true,
    };
    expect((await update(who, { name: "Invitee", phone: null })).id).toBe(w.a.inviteId);
    expect(await userRow(owner, w.a.boundId)).toEqual(before);
    expect(await userRow(owner, w.a.inviteId)).toMatchObject({
      name: "Invitee",
      identity_subject: `sub-new-${w.run}`,
    });
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
