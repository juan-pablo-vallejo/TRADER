// TASKS:50: the error-reporting seam, pure. A report is minimized — no message, params or
// identity reaches it, whatever was thrown — and reporting never throws, rejects or blocks.
import { TRPCError } from "@trpc/server";
import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  reportConfigFault,
  reportFailure,
  reportingOnError,
  toErrorReport,
  type ErrorReport,
} from "../../src/core/report";
import { recordingReporter, rejectingReporter, throwingReporter } from "../helpers";

const where = { source: "request", path: "probe.x", type: "query" } as const;

const SECRETS = [
  "worker@co.test",
  "sub-secret-subject",
  "0192f0c4-1111-7000-8000-000000000001",
  "41.8240",
  "-71.4128",
  "select",
];

function pgError(code: string) {
  return Object.assign(
    new Error('invalid input syntax for type uuid: "worker@co.test"'),
    {
      code,
    },
  );
}

function drizzleError() {
  return new DrizzleQueryError(
    "select * from users where email = $1 and company_id = $2 and lat = $3",
    ["worker@co.test", "0192f0c4-1111-7000-8000-000000000001", "41.8240", "-71.4128"],
    pgError("22P02"),
  );
}

const internal = (cause: unknown) =>
  new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "boom", cause });

describe("the minimized report", () => {
  it("carries names and SQLSTATE only, none of the query, params or identity", () => {
    const event = toErrorReport(internal(drizzleError()), where);
    expect(event).toMatchObject({
      source: "request",
      path: "probe.x",
      type: "query",
      errorNames: ["TRPCError", "DrizzleQueryError", "Error"],
      sqlstate: "22P02",
    });
    // Exactly these fields: no stack, no message, nothing free-form.
    expect(Object.keys(event).sort()).toEqual([
      "errorNames",
      "path",
      "source",
      "sqlstate",
      "type",
    ]);
    const text = JSON.stringify(event);
    for (const secret of [...SECRETS, "Failed query", "params", "boom", "sub-secret"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("carries nothing of a message shaped like a stack frame", () => {
    const error = new Error("first line\n    at injected (sub-secret-subject:1:1)\nlast");
    const text = JSON.stringify(toErrorReport(error, where));
    expect(text).not.toContain("injected");
    expect(text).not.toContain("sub-secret-subject");
  });

  it("stops on a cyclic cause and at five errors", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;
    expect(toErrorReport(a, where).errorNames).toEqual(["Error", "Error"]);
    let deep: Error = new Error("0");
    for (let i = 1; i < 10; i++) deep = new Error(String(i), { cause: deep });
    expect(toErrorReport(deep, where).errorNames).toHaveLength(5);
  });

  it("survives throwing getters and a Proxy that throws on every trap", () => {
    const hostile = new Error("x");
    for (const key of ["stack", "name", "message", "cause", "code"]) {
      Object.defineProperty(hostile, key, {
        get() {
          throw new Error("getter");
        },
      });
    }
    expect(toErrorReport(hostile, where)).toMatchObject({
      errorNames: ["Error"],
      sqlstate: null,
    });
    const trap = () => {
      throw new Error("trap");
    };
    const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, has: trap });
    expect(toErrorReport(proxy, where)).toMatchObject({
      errorNames: ["Unknown"],
    });
  });

  it("reports a thrown non-object as NonError and nothing of its value", () => {
    for (const value of ["worker@co.test", 42, Symbol("s"), null, undefined]) {
      const event = toErrorReport(value, where);
      expect(event.errorNames).toEqual(["NonError"]);
      expect(JSON.stringify(event)).not.toContain("worker@co.test");
    }
  });

  it("bounds every field: names, path and type", () => {
    class WithAVeryLongNameThatNoReportShouldEverCarryBecauseItIsFarTooLongToBeAClass extends Error {}
    const event = toErrorReport(
      new WithAVeryLongNameThatNoReportShouldEverCarryBecauseItIsFarTooLongToBeAClass(
        "x",
      ),
      { source: "request", path: "probe.x?worker@co.test", type: "weird" },
    );
    expect(event.errorNames).toEqual(["Unknown"]);
    expect(event).toMatchObject({ path: null, type: "unknown" });
  });
});

describe("a forged stack", () => {
  it("puts nothing of its frames in the report, even under a valid header", () => {
    const error = new Error("plain");
    Object.defineProperty(error, "stack", {
      value: [
        "Error: plain",
        "    at worker@co.test (0192f0c4-1111-7000-8000-000000000001:41.8240:-71.4128)",
        "    at SECRET-MARKER-7f3a (/srv/app.js:1:1)",
      ].join("\n"),
    });
    const text = JSON.stringify(toErrorReport(internal(error), where));
    for (const secret of [...SECRETS, "SECRET-MARKER-7f3a", "app.js"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("reportFailure", () => {
  it("reports what answers INTERNAL_SERVER_ERROR, a plain throw included", () => {
    const { reporter, events } = recordingReporter();
    reportFailure(reporter, internal(new Error("x")), where);
    reportFailure(reporter, new Error("thrown"), where);
    expect(events).toHaveLength(2);
  });

  it("reports no expected outcome: 401, 403, 400", () => {
    const { reporter, events } = recordingReporter();
    for (const code of [
      "UNAUTHORIZED",
      "FORBIDDEN",
      "BAD_REQUEST",
      "NOT_FOUND",
    ] as const) {
      reportFailure(reporter, new TRPCError({ code }), where);
    }
    expect(events).toEqual([]);
  });

  it("returns normally when the sink throws, rejects, or the value cannot be read", async () => {
    expect(() => reportFailure(throwingReporter, new Error("x"), where)).not.toThrow();
    expect(() => reportFailure(rejectingReporter, new Error("x"), where)).not.toThrow();
    const trap = () => {
      throw new Error("trap");
    };
    const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, has: trap });
    expect(() => reportFailure(throwingReporter, proxy, where)).not.toThrow();
    // A rejection left unhandled would fail this run; give it a turn to surface.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("never awaits the sink", () => {
    let settled = false;
    const slow = {
      report: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            settled = true;
            resolve();
          }, 50),
        ),
    };
    reportFailure(slow, new Error("x"), where);
    expect(settled).toBe(false);
  });
});

describe("reportingOnError and reportConfigFault", () => {
  it("reports an internal call through the adapter's onError shape", () => {
    const { reporter, events } = recordingReporter();
    reportingOnError(reporter)({
      error: internal(new Error("x")),
      path: "a.b",
      type: "mutation",
    });
    expect(events).toMatchObject([{ source: "request", path: "a.b", type: "mutation" }]);
  });

  it("never throws, whatever it is handed", () => {
    const onError = reportingOnError(throwingReporter);
    expect(() => onError({ error: new Error("x") })).not.toThrow();
    expect(() => onError(null as never)).not.toThrow();
  });

  it("names invalid variables only, from the TRADER_ set", () => {
    const { reporter, events } = recordingReporter();
    reportConfigFault(reporter, ["TRADER_SYNC_MODE", "paued", "DATABASE_URL"]);
    expect(events).toEqual<ErrorReport[]>([
      {
        source: "config",
        path: "status.get",
        type: "query",
        errorNames: [],
        sqlstate: null,
        invalid: ["TRADER_SYNC_MODE"],
      },
    ]);
  });
});
