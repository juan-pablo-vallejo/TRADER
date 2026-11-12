// TASKS, Stage 4: the job page's read over the real transport — the route module as Next
// calls it. `job.cost` is the office's alone and of the caller's company alone; a job with
// nothing recorded answers zeros in the shape the page reads. No labor or receipt is
// committed here: a ledger row can never be removed, and the figures a populated job comes
// to are the api suite's (jobs/cost.test.ts) and the demo's.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import { customers, jobs } from "@trader/db/schema";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import { invitation, ownerDb, query } from "./helpers";

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

async function jobOf(companyId: string, name: string) {
  const [customer] = await owner
    .insert(customers)
    .values({ companyId, name: "Smith Residence" })
    .returning({ id: customers.id });
  const [job] = await owner
    .insert(jobs)
    .values({ companyId, customerId: customer!.id, name })
    .returning({ id: jobs.id });
  return job!.id;
}

describe("job cost through the route handler", () => {
  it("answers 401 anonymous, 403 to a worker, and 403 for another company's job", async () => {
    const jobId = await jobOf(admin.companyId, "Kitchen");
    expect((await query(GET, "job.cost", { input: { jobId } })).status).toBe(401);
    // A worker of another company: refused at the gate; and their company's job is not the
    // admin's to read.
    const worker = await invitation(owner);
    try {
      const theirs = await jobOf(worker.companyId, "Porch");
      const asWorker = await query(GET, "job.cost", {
        input: { jobId: theirs },
        headers: as(worker.email),
      });
      expect(asWorker.status).toBe(403);
      const foreign = await query(GET, "job.cost", {
        input: { jobId: theirs },
        headers: as(admin.email),
      });
      expect(foreign.status).toBe(403);
      expect(foreign.body.error?.json.data.code).toBe("FORBIDDEN");
    } finally {
      await worker.cleanup();
    }
  });

  it("answers an admin with zeros for a job nothing is recorded on, and 400 for no id", async () => {
    const jobId = await jobOf(admin.companyId, "Kitchen");
    const read = await query(GET, "job.cost", {
      input: { jobId },
      headers: as(admin.email),
    });
    expect(read.status).toBe(200);
    expect(read.body.result?.data.json).toEqual({
      job: { id: jobId, name: "Kitchen", status: "open" },
      timezone: "America/New_York",
      labor: {
        lines: [],
        approvedHundredths: 0,
        totals: [],
        unrated: { hundredths: 0, lines: 0 },
        pending: { hundredths: 0, sessions: 0, totals: [], unratedHundredths: 0 },
        rejectedSessions: 0,
        openSessions: 0,
      },
      materials: {
        totals: [],
        receipts: 0,
        unpriced: 0,
        pending: { totals: [], receipts: 0, unpriced: 0 },
        rejected: 0,
        voided: 0,
      },
      total: [],
    });
    const bad = await query(GET, "job.cost", {
      input: { jobId: "not-a-job" },
      headers: as(admin.email),
    });
    expect(bad.status).toBe(400);
  });
});
