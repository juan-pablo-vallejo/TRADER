// TASKS, Stage 4: admin closeout (V1-D08), over the real transport — the route module as Next
// calls it, the bodies in superjson's envelope as the screen sends them, a Date among them:
// an admin reviews and submits an archived job on no crew, the same body again answers
// `duplicate`, and nobody else gets in.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import type { Db } from "@trader/db";
import { customers, dayCloseouts, jobs } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { GET, POST } from "../src/app/api/trpc/[trpc]/route";
import { uuidv7 } from "../src/app/closeout/uuidv7";
import { getDb } from "../src/server/db";
import { ENDPOINT } from "../src/server/handler";
import { disposableDb, invitation, type TrpcResult } from "./helpers";

// A database of its own: a closeout is append-only and references its company, its job and
// its submitter, so no fixture here could be deleted again.
let D: Awaited<ReturnType<typeof disposableDb>>;
let owner: Db;
let admin: Awaited<ReturnType<typeof invitation>>;
let jobId: string;

beforeAll(async () => {
  D = await disposableDb();
  owner = D.owner;
  getDb(D.env);
}, 60_000);
beforeEach(async () => {
  admin = await invitation(owner, { role: "admin" });
  const [customer] = await owner
    .insert(customers)
    .values({ companyId: admin.companyId, name: "Customer" })
    .returning({ id: customers.id });
  const [job] = await owner
    .insert(jobs)
    .values({
      companyId: admin.companyId,
      customerId: customer!.id,
      name: "Old porch",
      status: "archived",
    })
    .returning({ id: jobs.id });
  jobId = job!.id;
  vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await D.drop([getDb()]);
});

const as = (email: string) => ({
  [DEV_SUBJECT_HEADER]: `dev:${email}`,
  [DEV_EMAIL_HEADER]: email,
});

const DAY = "2026-10-05";

// One call as the browser's client makes it: the input serialized by superjson, the answer
// read back through it.
async function call(
  path: string,
  input: unknown,
  headers: Record<string, string> = {},
  mutation = false,
) {
  const wire = JSON.stringify(superjson.serialize(input));
  const url = new URL(`http://test${ENDPOINT}/${path}`);
  if (!mutation) url.searchParams.set("input", wire);
  const response = await (mutation ? POST : GET)(
    new Request(
      url,
      mutation
        ? {
            method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: wire,
          }
        : { headers },
    ),
  );
  const body = (await response.json()) as TrpcResult;
  const data =
    body.result === undefined
      ? undefined
      : superjson.deserialize(body.result.data as never);
  return { status: response.status, code: body.error?.json.data.code, data };
}

describe("the closeout through the route handler", () => {
  it("answers 401 anonymous and 403 to a worker, on the review and the submit", async () => {
    const worker = await invitation(owner);
    const submission = {
      id: uuidv7(),
      jobId,
      workDate: DAY,
      jobStatus: "complete",
      note: null,
      clientTimestamp: new Date(),
      reviewFingerprint: `v2.${"0".repeat(64)}`,
    };
    expect((await call("closeout.review", { jobId, workDate: DAY })).status).toBe(401);
    expect((await call("closeout.submit", submission, {}, true)).status).toBe(401);
    const asWorker = as(worker.email);
    expect((await call("closeout.review", { jobId, workDate: DAY }, asWorker)).code).toBe(
      "FORBIDDEN",
    );
    expect((await call("closeout.submit", submission, asWorker, true)).code).toBe(
      "FORBIDDEN",
    );
    expect(await owner.select().from(dayCloseouts)).toEqual([]);
  });

  it("lets an admin review and submit an archived job on no crew, once", async () => {
    const headers = as(admin.email);
    const review = await call("closeout.review", { jobId, workDate: DAY }, headers);
    expect(review.status).toBe(200);
    expect(review.data).toMatchObject({
      job: { name: "Old porch", status: "archived" },
      timeZone: "America/New_York",
      closeout: null,
      workers: [],
      materials: [],
    });
    const submission = {
      id: uuidv7(),
      jobId,
      workDate: DAY,
      jobStatus: "complete",
      note: "Closed by the office",
      clientTimestamp: new Date("2026-10-06T14:00:00.000Z"),
      reviewFingerprint: (review.data as { fingerprint: string }).fingerprint,
    };
    const first = await call("closeout.submit", submission, headers, true);
    expect(first.status).toBe(200);
    expect(first.data).toMatchObject({
      result: "accepted",
      closeout: { id: submission.id, jobStatusApplied: false },
    });
    const stamped = (first.data as { closeout: { serverTimestamp: unknown } }).closeout
      .serverTimestamp;
    expect(stamped).toBeInstanceOf(Date);

    // The same body again, as after a response that never arrived.
    const again = await call("closeout.submit", submission, headers, true);
    expect(again.data).toEqual({ ...(first.data as object), result: "duplicate" });

    const rows = await owner
      .select()
      .from(dayCloseouts)
      .where(eq(dayCloseouts.jobId, jobId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: submission.id,
      submittedByUserId: admin.userId,
      note: "Closed by the office",
      clientTimestamp: submission.clientTimestamp,
      jobStatusApplied: false,
    });
    const [job] = await owner
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, jobId));
    expect(job?.status).toBe("archived");

    // The review now says so; a second closeout of the day names the first.
    const after = await call("closeout.review", { jobId, workDate: DAY }, headers);
    expect((after.data as { closeout: unknown }).closeout).toEqual({
      id: submission.id,
      serverTimestamp: stamped,
    });
    const second = await call(
      "closeout.submit",
      { ...submission, id: uuidv7() },
      headers,
      true,
    );
    expect(second.data).toEqual({
      result: "rejected",
      code: "already_submitted",
      conflictingId: submission.id,
    });
  });
});
