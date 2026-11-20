// What the phone may send to Sentry, and nothing else: the phone's half of the office's
// rule (apps/web/src/server/sentry-event.ts). Every outgoing event is rebuilt from an
// allow-list, so a field this file does not name is never sent, whatever a later SDK
// version starts collecting. A report carries the build's number and the screen. It never
// carries a name, a phone number, a coordinate or an entry's contents: an error's message
// is dropped (a refused request's can quote what was sent), and so are the user, the
// device's name, breadcrumbs, extra and every context.
// Pure, and free of the SDK at run time, so the tests state the output byte for byte.
import type { ErrorEvent, Event } from "@sentry/react-native";

// The tags a report may carry: the screen (a route of this app, never an address with a
// value in it), the build's number, and for a sync failure which call failed and how.
const TAGS = ["screen", "build", "sync_stage", "sync_failure"] as const;
const LEVELS = ["fatal", "error", "warning", "info", "debug"];

const TOKEN = /^[A-Za-z0-9_.$,>@+()/ -]{1,200}$/;
const token = (value: unknown): string | undefined =>
  typeof value === "string" && TOKEN.test(value) ? value : undefined;
const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
// A file path or a function name: no white space, no query, bounded.
const place = (value: unknown): string | undefined =>
  typeof value === "string" && /^[^\s?#]{1,300}$/.test(value) ? value : undefined;
const DEBUG_ID = /^[0-9a-fA-F-]{32,36}$/;

const defined = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;

// Kept: when, how severe, which environment, release and build, the allowed tags, the
// grouping key, of each exception its class and its frames' positions, and the bundle's
// debug id, without which Sentry cannot find the source map and the stack is unreadable.
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
  const images = (event.debug_meta?.images ?? []).flatMap((image) =>
    image.type === "sourcemap" &&
    typeof image.debug_id === "string" &&
    DEBUG_ID.test(image.debug_id) &&
    place(image.code_file) !== undefined
      ? [
          {
            type: "sourcemap" as const,
            debug_id: image.debug_id,
            code_file: image.code_file,
          },
        ]
      : [],
  );
  return defined({
    type: undefined,
    event_id: typeof event.event_id === "string" ? event.event_id : undefined,
    timestamp: typeof event.timestamp === "number" ? event.timestamp : undefined,
    level: LEVELS.includes(event.level ?? "") ? event.level : "error",
    platform: token(event.platform),
    environment: token(event.environment),
    release: token(event.release),
    dist: token(event.dist),
    tags: Object.keys(tags).length > 0 ? tags : undefined,
    fingerprint:
      fingerprint.length > 0 && fingerprint.every((part) => part !== undefined)
        ? (fingerprint as string[])
        : undefined,
    exception: exceptions.length > 0 ? { values: exceptions } : undefined,
    debug_meta: images.length > 0 ? { images } : undefined,
  }) as ErrorEvent;
}

// A screen's name for a report: the route as the app's own files name it. This app has no
// route with a value in it; one that ever had would not pass, and the tag would be absent.
export const screenTag = (pathname: string): string | undefined =>
  /^\/[a-z-]{0,40}$/.test(pathname) ? (pathname === "/" ? "/" : pathname) : undefined;
