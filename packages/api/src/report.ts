// The error-reporting seam (RULES: three thin seams; ARCHITECTURE, error reporting). A reporter
// receives a minimized event, never the thrown value: a Drizzle query error's message holds the
// SQL and its parameters (emails, subjects, company ids, coordinates), so no message, input,
// context or header is ever copied. Reporting can never change an answer: building, minimizing
// and sending run inside one guard, a returned promise is never awaited and its rejection is
// swallowed. Consumed by routers/sync.ts (push records), routers/status.ts (configuration) and
// the route handler (Stage 4) through `reportingOnError`; Sentry (Stage 6) implements
// ErrorReporter.
import { TRPCError } from "@trpc/server";

export type ErrorReport = {
  source: "request" | "push_record" | "config";
  path: string | null;
  type: "query" | "mutation" | "subscription" | "unknown";
  // Constructor names down the cause chain, outermost first.
  errorNames: string[];
  // The first SQLSTATE on the chain: a schema-level code, never row data.
  sqlstate: string | null;
  // The deepest error's "at" lines, only when its stack begins exactly with its own header.
  frames: string[];
  // Configuration only: the names of invalid variables, never their values.
  invalid?: string[];
};

export type ErrorReporter = { report(event: ErrorReport): void | Promise<void> };

export type ReportWhere = {
  source: "request" | "push_record";
  path: string | null | undefined;
  type: string | undefined;
};

const NAME = /^[A-Za-z0-9_$]{1,64}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const PATH = /^[A-Za-z0-9.]{1,100}$/;
const VARIABLE = /^TRADER_[A-Z_]{1,40}$/;
const TYPES = ["query", "mutation", "subscription"] as const;
const MAX_CHAIN = 5;
const MAX_FRAMES = 20;
const MAX_FRAME = 300;
const MAX_STACK = 16_384;

// Every read of a thrown value may meet a throwing getter or a Proxy trap.
function read(o: object, key: string): unknown {
  try {
    return (o as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function nameOf(o: object): string {
  try {
    const n: unknown = Object.getPrototypeOf(o)?.constructor?.name;
    return typeof n === "string" && NAME.test(n) ? n : "Unknown";
  } catch {
    return "Unknown";
  }
}

// V8's stack header is `name: message`, or whichever of the two is not empty. A message spanning
// lines (Drizzle's SQL and params, a user string holding "\n    at ") is inside the header, so
// frames are taken only after an exact header match, and none otherwise.
function framesOf(o: object): string[] | null {
  const stack = read(o, "stack");
  const name = read(o, "name");
  const message = read(o, "message");
  if (typeof stack !== "string" || stack.length > MAX_STACK) return null;
  if (typeof name !== "string" || typeof message !== "string") return null;
  const header = name === "" ? message : message === "" ? name : `${name}: ${message}`;
  if (stack !== header && !stack.startsWith(`${header}\n`)) return null;
  return stack
    .slice(header.length)
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .slice(0, MAX_FRAMES)
    .map((line) => line.slice(0, MAX_FRAME));
}

// The minimizer. Pure over what it can read; anything unreadable is left out.
export function toErrorReport(error: unknown, where: ReportWhere): ErrorReport {
  const path =
    typeof where.path === "string" && PATH.test(where.path) ? where.path : null;
  const type = TYPES.find((t) => t === where.type) ?? "unknown";
  const event: ErrorReport = {
    source: where.source,
    path,
    type,
    errorNames: [],
    sqlstate: null,
    frames: [],
  };
  if (typeof error !== "object" || error === null) {
    event.errorNames.push("NonError");
    return event;
  }
  const seen = new Set<object>();
  let current: unknown = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current) &&
    seen.size < MAX_CHAIN
  ) {
    seen.add(current);
    event.errorNames.push(nameOf(current));
    const code = read(current, "code");
    if (event.sqlstate === null && typeof code === "string" && SQLSTATE.test(code)) {
      event.sqlstate = code;
    }
    const frames = framesOf(current);
    if (frames !== null) event.frames = frames;
    current = read(current, "cause");
  }
  return event;
}

// What the client is answered: a TRPCError keeps its code; anything else is an internal error,
// as tRPC itself treats it. An unreadable value is internal too.
function codeOf(error: unknown): string {
  try {
    if (error instanceof TRPCError) return error.code;
  } catch {
    // A Proxy whose prototype trap throws: not a TRPCError.
  }
  return "INTERNAL_SERVER_ERROR";
}

function deliver(reporter: ErrorReporter, build: () => ErrorReport | null): void {
  try {
    const event = build();
    if (event === null) return;
    const sent: unknown = reporter.report(event);
    if (typeof sent === "object" && sent !== null && "then" in sent) {
      (sent as Promise<void>).then(undefined, () => undefined);
    }
  } catch {
    // A reporter, or a value too hostile to minimize, never changes the call it reports on.
  }
}

// The one entry point for a failure. Only what answers INTERNAL_SERVER_ERROR is reported:
// 401, 403, 400 and a record's rejection are expected outcomes, not incidents.
export function reportFailure(
  reporter: ErrorReporter,
  error: unknown,
  where: ReportWhere,
): void {
  deliver(reporter, () =>
    codeOf(error) === "INTERNAL_SERVER_ERROR" ? toErrorReport(error, where) : null,
  );
}

// Invalid kill-switch configuration (routers/status.ts): variable names only.
export function reportConfigFault(
  reporter: ErrorReporter,
  invalid: readonly string[],
): void {
  deliver(reporter, () => ({
    source: "config",
    path: "status.get",
    type: "query",
    errorNames: [],
    sqlstate: null,
    frames: [],
    invalid: invalid.filter((v) => VARIABLE.test(v)),
  }));
}

// Until Sentry (Stage 6): one JSON line on stderr, which the platform's logs keep. Safe to log
// because an event holds no message, input or identity.
export const logReporter: ErrorReporter = {
  report(event) {
    console.error(JSON.stringify({ trader_error: event }));
  },
};

// The fetch adapter's `onError` (Stage 4's route handler). tRPC calls it after the call has
// settled, so a protected call's transaction has already rolled back, and calls it with no
// guard of its own, so this one never throws.
export function reportingOnError(reporter: ErrorReporter) {
  return (opts: { error: unknown; path?: string; type?: string }): void => {
    try {
      reportFailure(reporter, opts.error, {
        source: "request",
        path: opts.path,
        type: opts.type,
      });
    } catch {
      // An unreadable `opts`: nothing to report, and nothing to break.
    }
  };
}
