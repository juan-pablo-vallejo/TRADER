// Own record over the real transport — me.update by POST writes an admin's own name and
// phone and answers the narrowed record; 403 for a worker, whose name is the office's; 401
// anonymous.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import { users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import { invitation, mutate, ownerDb } from "./helpers";

const owner = ownerDb();
let fixture: Awaited<ReturnType<typeof invitation>>;

beforeEach(async () => {
  fixture = await invitation(owner);
  vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await getDb().$client.end();
  await owner.$client.end();
});

describe("me.update through the route handler", () => {
  it("writes an admin's own name and phone, 403 for a worker, 401 for nobody", async () => {
    const input = { name: "Renamed", phone: "401-555-0100" };
    const headers = {
      [DEV_SUBJECT_HEADER]: `dev:${fixture.email}`,
      [DEV_EMAIL_HEADER]: fixture.email,
    };
    expect((await mutate(POST, "me.update", { input })).status).toBe(401);
    // A worker's name is the office's.
    expect((await mutate(POST, "me.update", { input, headers })).status).toBe(403);
    await owner.update(users).set({ role: "admin" }).where(eq(users.id, fixture.userId));
    const r = await mutate(POST, "me.update", { input, headers });
    expect(r.status).toBe(200);
    expect(r.body.result?.data.json).toMatchObject({
      id: fixture.userId,
      email: fixture.email,
      role: "admin",
      ...input,
    });
    const [row] = await owner
      .select({ name: users.name, phone: users.phone, role: users.role })
      .from(users)
      .where(eq(users.id, fixture.userId));
    expect(row).toEqual({ ...input, role: "admin" });
  });
});
