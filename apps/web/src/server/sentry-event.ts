// What this server may send to Sentry, and nothing else (ARCHITECTURE, error reporting: the
// minimized event). Sentry's SDK collects a request's headers, cookies, body and user by
// default and attaches the machine's name and an error's message; here that is all switched
// off (`sentryInitOptions`) and then, as the net under it, every outgoing event is rebuilt
// from an allow-list (`scrubEvent`), so a field this file does not name is never sent,
// whatever a later SDK version starts collecting.
// An error's message is never sent: a DrizzleQueryError's holds the statement and its
// parameters (MEMORY). What is sent of an error is its class and where it was thrown.
// Pure, and free of the SDK at run time, so the tests state the output byte for byte.
import type { ErrorReport } from "@trader/api";
import type { ErrorEvent, Event, NodeOptions } from "@sentry/nextjs";

// The reporter's own events carry this prefix; no other message is ever sent.
export const MESSAGE_PREFIX = "trader_error";

// An ErrorReport's fields are already held to these alphabets by the API (core/report.ts);
// they are checked again here because this is the last code before the network.
const TOKEN = /^[A-Za-z0-9_.$,> -]{1,200}$/;
const MESSAGE = /^trader_error [A-Za-z0-9_.$ -]{0,200}$/;
const TAGS = [
  "source",
  "type",
  "path",
  "sqlstate",
  "request_id",
  "error_names",
  "invalid",
] as const;
const LEVELS = ["fatal", "error", "warning", "info", "debug"];

const token = (value: unknown): string | undefined =>
  typeof value === "string" && TOKEN.test(value) ? value : undefined;
const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
// A file path or a function name: no white space, no query, bounded.
const place = (value: unknown): string | undefined =>
  typeof value === "string" && /^[^\s?#]{1,300}$/.test(value) ? value : undefined;

const defined = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;

// One ErrorReport as a Sentry event: a message naming the failure, the report's fields as
// tags, and a fingerprint so one failure is one issue however many requests meet it.
export function toSentryEvent(report: ErrorReport): Event {
  const first = report.errorNames[0] ?? "";
  return {
    level: "error",
    message: [MESSAGE_PREFIX, report.source, report.path ?? "", first]
      .filter((part) => part !== "")
      .join(" "),
    tags: defined({
      source: report.source,
      type: report.type,
      path: report.path ?? undefined,
      sqlstate: report.sqlstate ?? undefined,
      request_id: report.requestId ?? undefined,
      error_names: report.errorNames.length > 0 ? report.errorNames.join(">") : undefined,
      invalid:
        report.invalid !== undefined && report.invalid.length > 0
          ? report.invalid.join(",")
          : undefined,
    }),
    fingerprint: [
      MESSAGE_PREFIX,
      report.source,
      report.path ?? "-",
      report.errorNames.join(">") || "-",
      report.sqlstate ?? "-",
    ],
  };
}

// The allow-list. Kept: when, how severe, which deployment, the reporter's message and
// tags, the grouping key, and of each exception its class and its frames' positions.
// Dropped, by never being copied: request, user, contexts, extra, breadcrumbs, the server's
// name, modules, the transaction name, an exception's message, a frame's source lines and
// variables, and any field added after this was written.
export function scrubEvent(event: Event): ErrorEvent {
  const tags = defined(
    Object.fromEntries(TAGS.map((name) => [name, token(event.tags?.[name])])),
  );
  const fingerprint = (event.fingerprint ?? []).map(token);
  const exceptions = (event.exception?.values ?? []).map((value) =>
    defined({
      type: token(value.type) ?? "Error",
      mechanism:
        value.mechanism === undefined
          ? undefined
          : { type: "generic", handled: value.mechanism.handled === true },
      stacktrace:
        value.stacktrace?.frames === undefined
          ? undefined
          : {
              frames: value.stacktrace.frames.map((frame) =>
                defined({
                  filename: place(frame.filename),
                  function: place(frame.function),
                  lineno: count(frame.lineno),
                  colno: count(frame.colno),
                  in_app: frame.in_app === true ? true : undefined,
                }),
              ),
            },
    }),
  );
  return defined({
    type: undefined,
    event_id: typeof event.event_id === "string" ? event.event_id : undefined,
    timestamp: typeof event.timestamp === "number" ? event.timestamp : undefined,
    level: LEVELS.includes(event.level ?? "") ? event.level : "error",
    platform: token(event.platform),
    environment: token(event.environment),
    release: token(event.release),
    message:
      typeof event.message === "string" && MESSAGE.test(event.message)
        ? event.message
        : undefined,
    tags: Object.keys(tags).length > 0 ? tags : undefined,
    fingerprint:
      fingerprint.length > 0 && fingerprint.every((part) => part !== undefined)
        ? (fingerprint as string[])
        : undefined,
    exception: exceptions.length > 0 ? { values: exceptions } : undefined,
  }) as ErrorEvent;
}

// Sentry.init's options: errors only, from the server only. No default integration (so no
// request, console or HTTP capture and no process-wide handlers), no tracing, no logs, no
// breadcrumbs, every data-collection switch off, and the allow-list on what is left.
// `environment` and `release` are Vercel's own variables, absent anywhere else.
export function sentryInitOptions(
  dsn: string,
  env: Record<string, string | undefined>,
): NodeOptions {
  return {
    dsn,
    environment: token(env.VERCEL_ENV) ?? token(env.NODE_ENV) ?? "development",
    release: token(env.VERCEL_GIT_COMMIT_SHA),
    defaultIntegrations: false,
    integrations: [],
    enableOpenTelemetrySetup: false,
    // No tracing here, so no module is patched to make spans for it.
    enableRuntimeChannelInjection: false,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
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
    beforeSend: (event) => scrubEvent(event),
  };
}
