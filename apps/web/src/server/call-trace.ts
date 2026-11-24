// The tracing trial (item 24e, the owner's decision 4): on staging alone, each API call's
// timing line (api core/observe.ts) becomes one Sentry transaction, so a slow procedure can
// be found by its path. Nothing else is traced: the SDK has no integration (sentry-event.ts),
// so no request, query or outgoing call makes a span, and the one span made here carries
// only the path, its times, its statement count, whether it answered and its code. Every
// outgoing transaction is rebuilt from that allow-list (scrubTransaction), which drops a
// transaction it cannot read. Production traces nothing; its privacy text says nothing of it.
import type { CallLine } from "@trader/api";
import type { Event } from "@sentry/nextjs";

import { sentryDsn } from "./deploy-env";
import { traderEnvironment } from "./environment";

type Env = Record<string, string | undefined>;

export const tracingOn = (env: Env): boolean => traderEnvironment(env) === "staging";

// A router's dotted name: what a transaction may be called.
const PATH = /^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)+$/;
const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_16 = /^[0-9a-f]{16}$/;
const TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;

export type CallSpan = {
  name: string;
  op: string;
  startTime: number;
  endTime: number;
  attributes: { statements: number; ok: boolean; code: string };
};

// One call's span, in seconds as Sentry takes them, ending when its line was written.
export const callSpan = (line: CallLine, endMs: number): CallSpan => ({
  name: line.path,
  op: `trpc.${line.type}`,
  startTime: (endMs - line.ms) / 1000,
  endTime: endMs / 1000,
  attributes: { statements: line.statements, ok: line.ok, code: line.code ?? "none" },
});

const str = (value: unknown, re: RegExp): string | undefined =>
  typeof value === "string" && re.test(value) ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

// The transaction as it may leave: rebuilt from named fields, every other dropped. Null
// (not sent) unless it is one of ours, named by a procedure's path.
export function scrubTransaction(event: Event): Event | null {
  const name = str(event.transaction, PATH);
  if (event.type !== "transaction" || name === undefined) return null;
  const trace = (event.contexts?.trace ?? {}) as Record<string, unknown>;
  const data = (trace.data ?? {}) as Record<string, unknown>;
  const statements = num(data.statements);
  const code = str(data.code, TOKEN);
  return {
    type: "transaction",
    transaction: name,
    start_timestamp: num(event.start_timestamp),
    timestamp: num(event.timestamp),
    environment: str(event.environment, TOKEN),
    release: str(event.release, TOKEN),
    platform: str(event.platform, TOKEN),
    event_id: str(event.event_id, HEX_32),
    spans: [],
    contexts: {
      trace: {
        trace_id: str(trace.trace_id, HEX_32),
        span_id: str(trace.span_id, HEX_16),
        op: str(trace.op, TOKEN),
        status: str(trace.status, TOKEN),
        data: {
          ...(statements === undefined ? {} : { statements }),
          ...(typeof data.ok === "boolean" ? { ok: data.ok } : {}),
          ...(code === undefined ? {} : { code }),
        },
      },
    },
  } as Event;
}

const FLUSH_TIMEOUT_MS = 2_000;

// Called with every timing line. On staging with an address, the call's span is made and
// sent after the response, inside Next's after() so a serverless function stays alive for
// it, as the error reporter does (reporter.ts); anywhere else, nothing. Never throws, never
// holds the answer.
export function traceCall(line: CallLine, env: Env = process.env): void {
  if (!tracingOn(env) || sentryDsn(env) === null) return;
  const span = callSpan(line, Date.now());
  const send = async () => {
    const Sentry = await import("@sentry/nextjs");
    // A trace of its own: nothing forks the scope per request, so without this every call
    // of a warm instance would share one trace id and Sentry would chain them.
    Sentry.startNewTrace(() => {
      const made = Sentry.startInactiveSpan({
        name: span.name,
        op: span.op,
        startTime: span.startTime,
        forceTransaction: true,
        attributes: span.attributes,
      });
      // A failed call reads as one. Sentry keeps a status message only from its own list,
      // which no tRPC code is on, so the status is "internal_error" (code 2) and the tRPC
      // code rides in the span's data.
      if (!line.ok) made.setStatus({ code: 2 });
      made.end(span.endTime);
    });
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  };
  const sendQuietly = () => send().catch(() => undefined);
  void import("next/server")
    .then(({ after }) => after(sendQuietly))
    .catch(() => sendQuietly());
}
