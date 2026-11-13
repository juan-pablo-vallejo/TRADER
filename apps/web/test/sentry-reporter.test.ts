// Release 0.1 R3: what reaches Sentry. The allow-list and the reporter are tested as pure
// code; the last suite runs the real SDK with these options and a transport that records
// the bytes it would have sent, and searches them for what must never leave.
import * as Sentry from "@sentry/nextjs";
import type { ErrorReport } from "@trader/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { webReporter, createWebReporter } from "../src/server/reporter";
import { scrubEvent, sentryInitOptions, toSentryEvent } from "../src/server/sentry-event";
import { recordingReporter } from "./helpers";

const DSN = "https://0123456789abcdef@o1.ingest.example.test/42";
const report: ErrorReport = {
  source: "request",
  requestId: "019a4a00-0000-7000-8000-000000000001",
  path: "roster.invite",
  type: "mutation",
  errorNames: ["DrizzleQueryError", "DatabaseError"],
  sqlstate: "23505",
};

// Everything a careless SDK could attach, each with a marker the tests search for.
const SECRETS = [
  "jane@example.test",
  "+14015550123",
  "select * from users",
  "sess_cookie",
  "Bearer tok",
  "host-name-01",
  "42.50",
  "const password",
  "local-secret",
  "evil-tag",
  "/jobs/123?token=abc",
];
const laden = () => ({
  event_id: "0123456789abcdef0123456789abcdef",
  timestamp: 1_800_000_000,
  level: "error" as const,
  platform: "node",
  environment: "preview",
  release: "abc123",
  server_name: "host-name-01",
  transaction: "GET /jobs/123?token=abc",
  message: "jane@example.test failed",
  user: { id: "u1", email: "jane@example.test", ip_address: "203.0.113.9" },
  request: {
    url: "https://app.example.test/jobs/123?token=abc",
    headers: { cookie: "sess_cookie", authorization: "Bearer tok" },
    data: { phone: "+14015550123" },
  },
  contexts: { device: { name: "host-name-01" }, trader: { amount: "42.50" } },
  extra: { input: { email: "jane@example.test" } },
  breadcrumbs: [{ message: "select * from users where phone = '+14015550123'" }],
  modules: { pg: "8.23.1" },
  tags: { source: "request", evil: "evil-tag", path: "jane@example.test" },
  fingerprint: ["{{ default }}", "jane@example.test"],
  exception: {
    values: [
      {
        type: "DrizzleQueryError",
        value:
          "Failed query: select * from users\nparams: jane@example.test,+14015550123",
        mechanism: {
          type: "onRequestError",
          handled: false,
          data: { url: "/jobs/123?token=abc" },
        },
        stacktrace: {
          frames: [
            {
              filename: "/var/task/apps/web/.next/server/chunks/a.js",
              function: "invite",
              lineno: 10,
              colno: 4,
              in_app: true,
              context_line: "const password = 'local-secret'",
              pre_context: ["const password = 1"],
              vars: { password: "local-secret" },
            },
          ],
        },
      },
    ],
  },
});

describe("toSentryEvent", () => {
  it("carries a report's fields as tags, a message and a grouping key, and no more", () => {
    expect(toSentryEvent(report)).toEqual({
      level: "error",
      message: "trader_error request roster.invite DrizzleQueryError",
      tags: {
        source: "request",
        type: "mutation",
        path: "roster.invite",
        sqlstate: "23505",
        request_id: "019a4a00-0000-7000-8000-000000000001",
        error_names: "DrizzleQueryError>DatabaseError",
      },
      fingerprint: [
        "trader_error",
        "request",
        "roster.invite",
        "DrizzleQueryError>DatabaseError",
        "23505",
      ],
    });
  });

  it("names invalid configuration by variable and leaves empty fields out", () => {
    expect(
      toSentryEvent({
        source: "config",
        requestId: null,
        path: "status.get",
        type: "query",
        errorNames: [],
        sqlstate: null,
        invalid: ["TRADER_SYNC_MODE", "TRADER_MIN_BUILD_IOS"],
      }),
    ).toEqual({
      level: "error",
      message: "trader_error config status.get",
      tags: {
        source: "config",
        type: "query",
        path: "status.get",
        invalid: "TRADER_SYNC_MODE,TRADER_MIN_BUILD_IOS",
      },
      fingerprint: ["trader_error", "config", "status.get", "-", "-"],
    });
  });

  it("passes through the allow-list unchanged", () => {
    const event = toSentryEvent(report);
    expect(scrubEvent(event)).toEqual(event);
  });
});

describe("scrubEvent", () => {
  it("rebuilds an event from the fields it names and drops every other", () => {
    const scrubbed = scrubEvent(laden());
    expect(scrubbed).toEqual({
      event_id: "0123456789abcdef0123456789abcdef",
      timestamp: 1_800_000_000,
      level: "error",
      platform: "node",
      environment: "preview",
      release: "abc123",
      tags: { source: "request" },
      exception: {
        values: [
          {
            type: "DrizzleQueryError",
            mechanism: { type: "generic", handled: false },
            stacktrace: {
              frames: [
                {
                  filename: "/var/task/apps/web/.next/server/chunks/a.js",
                  function: "invite",
                  lineno: 10,
                  colno: 4,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
    });
    const sent = JSON.stringify(scrubbed);
    for (const secret of SECRETS) expect(sent).not.toContain(secret);
  });

  it("drops a message that is not the reporter's own, and one dressed as it", () => {
    expect(
      scrubEvent({ message: "Unhandled: jane@example.test" }).message,
    ).toBeUndefined();
    expect(
      scrubEvent({ message: "trader_error jane@example.test" }).message,
    ).toBeUndefined();
    expect(scrubEvent({ message: "trader_error request me.get" }).message).toBe(
      "trader_error request me.get",
    );
  });
});

describe("sentryInitOptions", () => {
  it("switches off every integration, tracing, breadcrumbs and data collection", () => {
    const options = sentryInitOptions(DSN, {
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "abc123",
    });
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "preview",
      release: "abc123",
      defaultIntegrations: false,
      integrations: [],
      enableOpenTelemetrySetup: false,
      enableRuntimeChannelInjection: false,
      maxBreadcrumbs: 0,
      attachStacktrace: false,
      includeLocalVariables: false,
      sendClientReports: false,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        frameContextLines: 0,
      },
    });
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.tracesSampler).toBeUndefined();
    expect(options.beforeBreadcrumb?.({ message: "x" })).toBeNull();
    expect(sentryInitOptions(DSN, { NODE_ENV: "test" }).environment).toBe("test");
  });
});

describe("createWebReporter", () => {
  const harness = (configured: boolean, send = vi.fn(() => Promise.resolve())) => {
    const log = recordingReporter();
    const deferred: (() => Promise<void>)[] = [];
    const reporter = createWebReporter({
      configured: () => configured,
      send,
      defer: (work) => deferred.push(work),
      log: log.reporter,
    });
    return { reporter, log, deferred, send };
  };

  it("logs and sends nothing where no address is configured", () => {
    const { reporter, log, deferred, send } = harness(false);
    void reporter.report(report);
    expect(log.events).toEqual([report]);
    expect(deferred).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("logs at once and sends the minimized event after the response", async () => {
    const { reporter, log, deferred, send } = harness(true);
    void reporter.report(report);
    expect(log.events).toEqual([report]);
    expect(send).not.toHaveBeenCalled();
    await deferred[0]!();
    expect(send).toHaveBeenCalledExactlyOnceWith(toSentryEvent(report));
  });

  it("swallows a failure to send", async () => {
    const { reporter, deferred } = harness(
      true,
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    void reporter.report(report);
    await expect(deferred[0]!()).resolves.toBeUndefined();
  });

  it("is what the routes are wired with, and sends nothing with no address", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("SENTRY_DSN", "");
    expect(() => void webReporter.report(report)).not.toThrow();
    expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ trader_error: report }));
  });
});

describe("the SDK under these options", () => {
  afterEach(async () => {
    await Sentry.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const start = () => {
    const bodies: string[] = [];
    Sentry.init({
      ...sentryInitOptions(DSN, { VERCEL_ENV: "preview" }),
      transport: (options: Parameters<typeof Sentry.createTransport>[0]) =>
        Sentry.createTransport(options, (request) => {
          bodies.push(
            typeof request.body === "string"
              ? request.body
              : new TextDecoder().decode(request.body),
          );
          return Promise.resolve({ statusCode: 200 });
        }),
    });
    return bodies;
  };

  it("sends a thrown error as its class and position, with nothing of the person", async () => {
    const bodies = start();
    Sentry.setUser({ id: "u1", email: "jane@example.test" });
    Sentry.setContext("trader", { phone: "+14015550123" });
    Sentry.setExtra("input", "select * from users");
    Sentry.setTag("evil", "evil-tag");
    Sentry.addBreadcrumb({ message: "sess_cookie" });
    class DrizzleQueryError extends Error {
      override name = "DrizzleQueryError";
    }
    Sentry.captureException(
      new DrizzleQueryError(
        "Failed query: select * from users params: jane@example.test",
      ),
    );
    await Sentry.flush(2_000);
    expect(bodies).toHaveLength(1);
    const sent = bodies[0]!;
    expect(sent).toContain('"type":"DrizzleQueryError"');
    expect(sent).toContain('"environment":"preview"');
    for (const secret of SECRETS) expect(sent).not.toContain(secret);
    expect(sent).not.toContain("server_name");
    expect(sent).not.toContain('"user"');
    expect(sent).not.toContain('"request"');
    expect(sent).not.toContain('"contexts"');
    expect(sent).not.toContain('"breadcrumbs"');
  });

  it("sends a report as its tags and message", async () => {
    const bodies = start();
    Sentry.captureEvent(toSentryEvent(report));
    await Sentry.flush(2_000);
    expect(bodies).toHaveLength(1);
    const event = JSON.parse(bodies[0]!.split("\n")[2]!) as Record<string, unknown>;
    expect(event).toMatchObject(toSentryEvent(report));
    expect(Object.keys(event).sort()).toEqual(
      [
        "environment",
        "event_id",
        "fingerprint",
        "level",
        "message",
        "platform",
        // The SDK's own name and version, added after the allow-list.
        "sdk",
        "tags",
        "timestamp",
      ].sort(),
    );
  });
});
