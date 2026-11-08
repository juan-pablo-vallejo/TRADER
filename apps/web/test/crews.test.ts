// TASKS:46: crews over the real transport — the route module as Next calls it, the development
// headers as the cookie bridge sets them: 401 anonymous, 403 as a worker, and an admin's create
// (the foreman a member), list and the is_foreman refusal through POST and GET.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import { users } from "@trader/db/schema";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import { invitation, mutate, ownerDb, query } from "./helpers";

const owner = ownerDb();
let admin: Awaited<ReturnType<typeof invitation>>;

beforeEach(async () => {
  admin = await invitation(owner, { role: "admin" });
  vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
});
afterEach(async () => {
  await admin.cleanup();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await getDb().$client.end();
  await owner.$client.end();
});

const as = (email: string) => ({
  [DEV_SUBJECT_HEADER]: `dev:${email}`,
  [DEV_EMAIL_HEADER]: email,
});

describe("crews through the route handler", () => {
  it("answers 401 anonymous and 403 as a worker", async () => {
    expect((await query(GET, "crew.list")).status).toBe(401);
    const worker = await invitation(owner);
    try {
      const r = await query(GET, "crew.list", { headers: as(worker.email) });
      expect(r.status).toBe(403);
      expect(r.body.error?.json.data.code).toBe("FORBIDDEN");
    } finally {
      await worker.cleanup();
    }
  });

  it("creates by POST with the foreman a member, lists by GET, refuses removing the foreman", async () => {
    const [foreman] = await owner
      .insert(users)
      .values({
        companyId: admin.companyId,
        email: `foreman-${admin.run}@web.test`,
        name: "Foreman",
        role: "foreman",
      })
      .returning({ id: users.id });
    const created = await mutate(POST, "crew.create", {
      input: { name: "Crew One", foremanUserId: foreman!.id },
      headers: as(admin.email),
    });
    expect(created.status).toBe(200);
    const crew = (created.body.result?.data.json as { crew: { id: string } }).crew;
    expect(crew).toMatchObject({
      name: "Crew One",
      foreman: { id: foreman!.id, available: true },
      members: [{ id: foreman!.id, role: "foreman" }],
      jobCount: 0,
    });
    const list = await query(GET, "crew.list", { headers: as(admin.email) });
    expect(list.status).toBe(200);
    expect(list.body.result?.data.json).toEqual([crew]);
    const refused = await mutate(POST, "crew.removeMember", {
      input: { crewId: crew.id, userId: foreman!.id },
      headers: as(admin.email),
    });
    expect(refused.status).toBe(200);
    expect(refused.body.result?.data.json).toEqual({
      result: "rejected",
      code: "is_foreman",
    });
  });
});
