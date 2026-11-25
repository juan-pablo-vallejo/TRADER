// The error-reporting seam. A reporter
// receives a minimized event, never the thrown value: a Drizzle query error's message holds the
// SQL and its parameters (emails, subjects, company ids, coordinates), so no message, input,
// context or header is ever copied. Reporting can never change an answer: building, minimizing
// and sending run inside one guard, a returned promise is never awaited and its rejection is
// swallowed.
import { TRPCError } from "@trpc/server";

export type ErrorReport = {
  source: "request" | "push_record" | "config";
  // The HTTP request's id (apps/web handler): random, made by the server, naming nobody.
  // Null where no request is known.
  requestId: string | null;
  path: string | null;
  type: "query" | "mutation" | "subscription" | "unknown";
  // Constructor names down the cause chain, outermost first.
  errorNames: string[];
  // The first SQLSTATE on the chain: a schema-level code, never row data.
  sqlstate: string | null;
  // No stack frames: a stack is free text that any code, or a forged value, can fill, so no
  // filter over it is a guarantee. Sentry decides frames under its own scrubbing. The
  // server's own log line gets strict frames beside the event (ReportDetail, framesOf).
  // Configuration only: the names of invalid variables, never their values.
  invalid?: string[];
};

// What only the server's own log line carries, never an event sent anywhere: where the
// error was thrown, as framesOf reads it.
export type ReportDetail = { frames: string[] };

export type ErrorReporter = {
  report(event: ErrorReport, detail?: ReportDetail): void | Promise<void>;
};

type ReportWhere = {
  source: "request" | "push_record";
  path: string | null | undefined;
  type: string | undefined;
  requestId?: string | null | undefined;
};

const NAME = /^[A-Za-z0-9_$]{1,64}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const PATH = /^[A-Za-z0-9.]{1,100}$/;
const VARIABLE = /^TRADER_[A-Z_]{1,40}$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TYPES = ["query", "mutation", "subscription"] as const;
const MAX_CHAIN = 5;

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

// The minimizer. Pure over what it can read; anything unreadable is left out.
export function toErrorReport(error: unknown, where: ReportWhere): ErrorReport {
  const path =
    typeof where.path === "string" && PATH.test(where.path) ? where.path : null;
  const type = TYPES.find((t) => t === where.type) ?? "unknown";
  const requestId =
    typeof where.requestId === "string" && REQUEST_ID.test(where.requestId)
      ? where.requestId
      : null;
  const event: ErrorReport = {
    source: where.source,
    requestId,
    path,
    type,
    errorNames: [],
    sqlstate: null,
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
    current = read(current, "cause");
  }
  return event;
}

// Where an error was thrown, for the server's log line (M18): at most 8 frames, each
// "function at file:line:col", the file only from this repository's `packages/` or `apps/`
// (a built server's `.next/` too) and never under node_modules. Only the stack after its
// own header (`Name: message`) is read, so nothing a message holds is taken for a frame; a
// stack whose header cannot be found gives none. A stack set apart from its message (a thrown
// plain object, which tRPC copies as both) can still carry lines of its own: a path takes no
// `@`, so no address passes for one. The deepest error on the chain with a
// frame wins: that is where the failure began.
const FRAME =
  /^\s+at (?:(?:async |new )?([A-Za-z0-9_$.<>]{1,80}) \()?(?:file:\/\/)?(\/[A-Za-z0-9_.[\]()+/-]{1,300}\.(?:[mc]?[jt]sx?)):(\d{1,6}):(\d{1,6})\)?$/;
const IN_REPO = /\/(?:packages|apps)\/(.+)$|\/(\.next\/.+)$/;
const MAX_FRAMES = 8;

function framesOfOne(error: object): string[] {
  const stack = read(error, "stack");
  const message = read(error, "message");
  if (typeof stack !== "string" || typeof message !== "string") return [];
  const at = stack.indexOf(message);
  if (at === -1) return [];
  const frames: string[] = [];
  for (const line of stack.slice(at + message.length).split("\n")) {
    const m = FRAME.exec(line);
    if (m === null) continue;
    const path = m[2]!;
    if (path.includes("/node_modules/")) continue;
    const file = IN_REPO.exec(path);
    if (file === null) continue;
    frames.push(`${m[1] ?? "?"} at ${file[1] ?? file[2]}:${m[3]}:${m[4]}`);
    if (frames.length === MAX_FRAMES) break;
  }
  return frames;
}

export function framesOf(error: unknown): string[] {
  let found: string[] = [];
  const seen = new Set<object>();
  let current: unknown = error;
  try {
    while (
      typeof current === "object" &&
      current !== null &&
      !seen.has(current) &&
      seen.size < MAX_CHAIN
    ) {
      seen.add(current);
      const frames = framesOfOne(current);
      if (frames.length > 0) found = frames;
      current = read(current, "cause");
    }
  } catch {
    // A hostile value: the frames read so far stand.
  }
  return found;
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

function deliver(
  reporter: ErrorReporter,
  build: () => ErrorReport | null,
  detail?: () => ReportDetail,
): void {
  try {
    const event = build();
    if (event === null) return;
    const sent: unknown =
      detail === undefined ? reporter.report(event) : reporter.report(event, detail());
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
  deliver(
    reporter,
    () =>
      codeOf(error) === "INTERNAL_SERVER_ERROR" ? toErrorReport(error, where) : null,
    () => ({ frames: framesOf(error) }),
  );
}

// Invalid kill-switch configuration (routers/status.ts): variable names only.
export function reportConfigFault(
  reporter: ErrorReporter,
  invalid: readonly string[],
): void {
  deliver(reporter, () => ({
    source: "config",
    requestId: null,
    path: "status.get",
    type: "query",
    errorNames: [],
    sqlstate: null,
    invalid: invalid.filter((v) => VARIABLE.test(v)),
  }));
}

// One JSON line on stderr, which the platform's logs keep. Safe to log
// because an event holds no message, input or identity, and frames only code locations.
export const logReporter: ErrorReporter = {
  report(event, detail) {
    const frames = detail?.frames ?? [];
    console.error(
      JSON.stringify({ trader_error: event, ...(frames.length > 0 && { frames }) }),
    );
  },
};

// The fetch adapter's `onError` (the route handler's). tRPC calls it after the call has
// settled, so a protected call's transaction has already rolled back, and calls it with no
// guard of its own, so this one never throws. `requestId` is the handler's, made before the
// context is: a request whose context could not be built is still reported under its id.
export function reportingOnError(reporter: ErrorReporter, requestId?: string) {
  return (opts: { error: unknown; path?: string; type?: string }): void => {
    try {
      reportFailure(reporter, opts.error, {
        source: "request",
        path: opts.path,
        type: opts.type,
        requestId,
      });
    } catch {
      // An unreadable `opts`: nothing to report, and nothing to break.
    }
  };
}
