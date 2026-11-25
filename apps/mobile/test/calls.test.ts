// The calls this build sends, recorded through the phone's own client (src/api.ts,
// createApi) as they go on the wire, for packages/api/test/contract/replay.test.ts to send
// to every later server. A released build is used for weeks, so each one's calls are kept
// beside the others under builds/<date>-<commit>/, and the server must answer every one
// without BAD_REQUEST or `invalid_record` ("The phone's contract", docs/ARCHITECTURE.md).
// The inputs are built the way the screens and the sync engine build them. The commit is the
// first whose phone source sends exactly these calls. A kept build's file is never rewritten:
// when what the phone sends changes, BUILD_DIR names a new directory (that change's commit)
// and the old one stays for the builds still installed, so `vitest -u` here is a decision.
import { keyCheck } from "../src/biometric-rules";
import { expect, it } from "vitest";

import { createApi } from "../src/api";
import { createMinter } from "../src/ids";
import { recordsFor } from "../src/sync/clock";

const BUILD_DIR = "../../../packages/api/test/contract/builds/2026-11-25-a3c6dd9";
const T = Date.UTC(2026, 10, 24, 14, 0, 0);
const WORKER = "01900000-0000-7000-8000-000000000001";
const OTHER = "01900000-0000-7000-8000-000000000002";
const JOB = "01900000-0000-7000-8000-00000000000a";

type Sent = { path: string; type: "query" | "mutation"; input: unknown };

it("records every call this build makes, as sent", async () => {
  const sent: Sent[] = [];
  const recording: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.split("/").at(-1)!;
    const query = init?.method !== "POST";
    // One call per request here (each is awaited alone), unbatched as `?batch=1&input={"0":…}`.
    const raw = query ? url.searchParams.get("input") : String(init?.body);
    const batch = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    sent.push({ path, type: query ? "query" : "mutation", input: batch["0"] ?? null });
    return Promise.reject(new Error("recorded"));
  };
  const api = createApi("https://api.test", () => ({}), recording);
  const call = (p: Promise<unknown>) => p.catch(() => undefined);
  const mint = createMinter((n) => new Uint8Array(n).fill(9));

  // Signing in and the sync engine (sync/provider.tsx).
  await call(api.me.get.query());
  // After a sign-in by the phone's key (ui/phone-sign-in.tsx, keyCheck).
  await call(api.me.get.query(keyCheck("biometric", new Date(T).toISOString())));
  await call(api.status.get.query({ protocolVersion: 1, platform: "ios", build: 1 }));
  const records = recordsFor(
    { action: "start", jobId: JOB },
    { status: "off" },
    {
      me: WORKER,
      now: T,
      reading: T - 30_000,
      location: { lat: 41.82, lng: -71.41, accuracyM: 8 },
      mint,
    },
  );
  await call(
    api.sync.push.mutate({
      protocolVersion: 1,
      deviceNow: new Date(T + 1000),
      records: records.map((r) => ({
        id: r.id,
        kind: "labor_event" as const,
        schemaVersion: 1,
        payload: r.payload,
      })),
    }),
  );
  await call(api.sync.pull.query({ protocolVersion: 1 }));
  // Me (app/(tabs)/me.tsx).
  await call(api.me.update.mutate({ name: "Luis Herrera", phone: "+14015550101" }));
  await call(api.me.update.mutate({ name: "Luis Herrera", phone: null }));
  // The Crew tab (app/(tabs)/crew.tsx).
  await call(api.overview.today.query());
  await call(api.people.list.query());
  await call(
    api.shift.create.mutate({
      userId: OTHER,
      jobId: JOB,
      expectedStart: "07:00",
      expectedEnd: "15:30",
      days: [{ id: mint(T), workDate: "2026-11-24" }],
    }),
  );
  await call(
    api.shift.moveToday.mutate({
      id: mint(T),
      userId: OTHER,
      jobId: JOB,
      at: "11:30",
      expectedEnd: "15:30",
    }),
  );
  await call(
    api.job.setLocation.mutate({
      jobId: JOB,
      location: { lat: 41.82, lng: -71.41, radiusM: 150 },
    }),
  );
  // The Demo sign-in (ui/phone-sign-in.tsx).
  await call(api.demo.signIn.mutate({ phone: "+14015550100", code: "a-long-demo-code" }));

  await expect(`${JSON.stringify(sent, null, 2)}\n`).toMatchFileSnapshot(
    `${BUILD_DIR}/calls.json`,
  );
});
