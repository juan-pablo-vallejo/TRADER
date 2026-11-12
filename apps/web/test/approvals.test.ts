// TASKS, Stage 4: the approval queue over the real transport — the route module as Next calls
// it. An admin reads their company's queue and nobody else does; a decision on an approval
// that is not theirs to see is refused. Nothing is decided here: a decision leaves an audit
// row that can never be removed, so the workflow itself runs in a disposable database
// (repair.test.ts) and its rules are the api suite's (approvals/).
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
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

// A well-formed id no approval has.
const NO_APPROVAL = "0193a1b2-c3d4-7e5f-8a6b-0123456789ab";

describe("the approval queue through the route handler", () => {
  it("answers 401 anonymous and 403 to a worker, read and write", async () => {
    const decision = { approvalId: NO_APPROVAL, decision: "approved" };
    expect((await query(GET, "approval.queue", { input: {} })).status).toBe(401);
    expect((await mutate(POST, "approval.decide", { input: decision })).status).toBe(401);
    const worker = await invitation(owner);
    try {
      const headers = as(worker.email);
      expect((await query(GET, "approval.queue", { input: {}, headers })).status).toBe(
        403,
      );
      expect(
        (await mutate(POST, "approval.decide", { input: decision, headers })).status,
      ).toBe(403);
    } finally {
      await worker.cleanup();
    }
  });

  it("answers an admin with the company's zone and an empty queue", async () => {
    const read = await query(GET, "approval.queue", {
      input: { limit: 50 },
      headers: as(admin.email),
    });
    expect(read.status).toBe(200);
    expect(read.body.result?.data.json).toEqual({
      timezone: "America/New_York",
      items: [],
      next: null,
    });
  });

  it("refuses an admin a decision on an approval they cannot see, and a malformed one", async () => {
    const headers = as(admin.email);
    const unseen = await mutate(POST, "approval.decide", {
      input: { approvalId: NO_APPROVAL, decision: "approved" },
      headers,
    });
    expect(unseen.status).toBe(403);
    const malformed = await mutate(POST, "approval.decide", {
      input: { approvalId: NO_APPROVAL, decision: "undone" },
      headers,
    });
    expect(malformed.status).toBe(400);
  });
});
