// The tracing trial (item 24e, the owner's decision 4): on staging alone, each call's timing
// line becomes one Sentry transaction, and nothing else is traced. What may leave is held to
// an allow-list: the procedure's path, its times, its statement count, whether it answered
// and its code. No request, user, header, input or identity.
import type { Event } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { callSpan, scrubTransaction, tracingOn } from "../src/server/call-trace";
import { sentryInitOptions } from "../src/server/sentry-event";

const DSN = "https://k@o1.ingest.sentry.io/1";
const line = {
  requestId: "8d61cc0b-1759-4086-9319-5402e841e859",
  path: "me.get",
  type: "query" as const,
  ms: 16.3,
  statements: 7,
  ok: false,
  code: "UNAUTHORIZED",
  refusals: [{ recordId: "r", kind: "labor_event", code: "no_open_session" }],
};

describe("the tracing trial", () => {
  it("traces on staging alone", () => {
    expect(tracingOn({ TRADER_ENVIRONMENT: "staging" })).toBe(true);
    for (const env of [
      { TRADER_ENVIRONMENT: "production" },
      {},
      { NODE_ENV: "development" },
    ]) {
      expect(tracingOn(env)).toBe(false);
    }
    const staging = sentryInitOptions(DSN, { TRADER_ENVIRONMENT: "staging" });
    expect(staging.tracesSampleRate).toBe(1);
    // Streamed spans skip beforeSendTransaction: the allow-list runs only under `static`.
    expect(staging.traceLifecycle).toBe("static");
    expect(staging.beforeSendTransaction).toBeTypeOf("function");
    expect(
      sentryInitOptions(DSN, { TRADER_ENVIRONMENT: "production" }).tracesSampleRate,
    ).toBeUndefined();
  });

  it("makes one span of a call line: path, times, statements and code, nothing else", () => {
    const end = 1_795_520_000_000;
    expect(callSpan(line, end)).toEqual({
      name: "me.get",
      op: "trpc.query",
      startTime: (end - 16.3) / 1000,
      endTime: end / 1000,
      attributes: { statements: 7, ok: false, code: "UNAUTHORIZED" },
    });
  });

  it("sends a transaction rebuilt from the allow-list, and drops one it cannot read", () => {
    const sent = {
      type: "transaction",
      transaction: "me.get",
      start_timestamp: 1,
      timestamp: 2,
      environment: "staging",
      release: "abc123",
      platform: "node",
      event_id: "0123456789abcdef0123456789abcdef",
      request: {
        url: "https://x/api/trpc/me.get?input=secret",
        headers: { cookie: "c" },
      },
      user: { id: "u", email: "worker@co.test" },
      tags: { phone: "+14015550101" },
      extra: { input: "secret" },
      breadcrumbs: [{ message: "worker@co.test" }],
      spans: [{ span_id: "a", description: "select * from users where email = 'x'" }],
      contexts: {
        trace: {
          trace_id: "0123456789abcdef0123456789abcdef",
          span_id: "0123456789abcdef",
          op: "trpc.query",
          status: "ok",
          data: {
            statements: 7,
            ok: true,
            code: "none",
            "http.url": "https://x?worker@co.test",
          },
        },
        os: { name: "linux" },
        runtime: { name: "node" },
      },
    } as unknown as Event;
    const kept = scrubTransaction(sent)!;
    expect(kept).toEqual({
      type: "transaction",
      transaction: "me.get",
      start_timestamp: 1,
      timestamp: 2,
      environment: "staging",
      release: "abc123",
      platform: "node",
      event_id: "0123456789abcdef0123456789abcdef",
      spans: [],
      contexts: {
        trace: {
          trace_id: "0123456789abcdef0123456789abcdef",
          span_id: "0123456789abcdef",
          op: "trpc.query",
          status: "ok",
          data: { statements: 7, ok: true, code: "none" },
        },
      },
    });
    expect(JSON.stringify(kept)).not.toMatch(/worker|secret|cookie|\+1401|select/);
    // A name that is not a procedure's path is no transaction of ours.
    expect(
      scrubTransaction({ ...sent, transaction: "GET /api/trpc/me.get" } as Event),
    ).toBeNull();
  });
});
