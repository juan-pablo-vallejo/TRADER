// TASKS:45: me.update — any active role edits its own name and phone, those two columns only,
// and nothing else about the row moves; a deactivated or anonymous caller is UNAUTHORIZED.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appCaller,
  appDb,
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
      { name: "Name" },
    ]) {
      expect(await outcome(update(m.who, input as Input))).toBe("BAD_REQUEST");
    }
    expect(await userRow(owner, m.id)).toMatchObject({ role: "worker" });
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
