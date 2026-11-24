// What the tracing trial really sends (call-trace.ts), through the installed Sentry SDK with a
// transport that records instead of sending. The options and the allow-list are tested
// apart (call-trace.test.ts); this holds the SDK to honouring them: an upgrade under which
// beforeSendTransaction no longer runs, or a production client that traces, turns it red.
import os from "node:os";

import * as Sentry from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { traceCall } from "../src/server/call-trace";
import { sentryInitOptions } from "../src/server/sentry-event";

const DSN = "https://k@o1.ingest.sentry.io/1";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const REQUEST = "8d61cc0b-1759-4086-9319-5402e841e859";
const line = {
  requestId: REQUEST,
  path: "me.get",
  type: "query" as const,
  ms: 16.3,
  statements: 7,
  ok: false,
  code: "UNAUTHORIZED",
  refusals: [],
};

type Envelope = [unknown, [{ type: string }, Record<string, unknown>][]];

// Everything the client would send, after `work`, with personal data planted on every scope.
async function sentFrom(env: Record<string, string | undefined>, work: () => void) {
  const sent: Envelope[] = [];
  Sentry.init({
    ...sentryInitOptions(DSN, env),
    transport: () => ({
      send: (envelope: Envelope) => {
        sent.push(envelope);
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
  } as Parameters<typeof Sentry.init>[0]);
  Sentry.setUser({ id: "u", email: "worker@co.test" });
  Sentry.setTag("phone", "+14015550101");
  Sentry.getIsolationScope().setSDKProcessingMetadata({
    normalizedRequest: { url: "https://x/?secret", headers: { cookie: "c" } },
  });
  work();
  await new Promise((r) => setTimeout(r, 300));
  await Sentry.flush(2000);
  await Sentry.close(2000);
  return sent.flatMap(([, items]) => items);
}

describe("the tracing trial, as sent", () => {
  it("sends one allow-listed transaction per call on staging, each its own trace", async () => {
    const env = {
      TRADER_ENVIRONMENT: "staging",
      SENTRY_DSN: DSN,
      VERCEL_GIT_COMMIT_SHA: COMMIT,
    };
    const items = await sentFrom(env, () => {
      traceCall(line, env);
      traceCall(
        { ...line, path: "sync.push", type: "mutation", ok: true, code: null },
        env,
      );
    });
    const transactions = items
      .filter(([h]) => h.type === "transaction")
      .map(([, e]) => e);
    expect(items.map(([h]) => h.type)).toEqual(["transaction", "transaction"]);
    expect(transactions.map((t) => t.transaction).sort()).toEqual([
      "me.get",
      "sync.push",
    ]);
    for (const t of transactions) {
      expect(Object.keys(t).sort()).toEqual(
        [
          "contexts",
          "environment",
          "event_id",
          "platform",
          "release",
          // The SDK's own name, version and integrations, added after the allow-list, as
          // on every error event.
          "sdk",
          "spans",
          "start_timestamp",
          "timestamp",
          "transaction",
          "type",
        ].filter((k) => k in t),
      );
      expect(Object.keys(t)).not.toContain("request");
      expect(Object.keys(t)).not.toContain("user");
      expect(Object.keys(t)).not.toContain("tags");
    }
    const traces = transactions.map(
      (t) => (t.contexts as { trace: { trace_id: string; status: string } }).trace,
    );
    expect(new Set(traces.map((t) => t.trace_id)).size).toBe(2);
    const failed = transactions.find((t) => t.transaction === "me.get")!;
    expect((failed.contexts as { trace: { status: string } }).trace.status).not.toBe(
      "ok",
    );
    const json = JSON.stringify(transactions);
    expect(json).not.toMatch(/worker|secret|cookie|\+1401/);
    expect(json).not.toContain(REQUEST);
    expect(json).not.toContain(os.hostname());
  });

  it("sends nothing from production, or with no environment named", async () => {
    for (const named of [{ TRADER_ENVIRONMENT: "production" }, {}]) {
      const env = { ...named, SENTRY_DSN: DSN };
      const items = await sentFrom(env, () => {
        traceCall(line, env);
        Sentry.startInactiveSpan({ name: "forced", forceTransaction: true }).end();
      });
      expect(items).toEqual([]);
    }
  });
});
