// sync.push: a device's outbox, oldest
// first, each record in a caller transaction of its own, in batch order. A record answers
// `accepted` or `duplicate` (success) or `rejected` (permanent); a record left out of the
// answer is retried. The loop stops at the first record that throws — a timeout, a lost lock,
// a ledger that fails replay — because the records behind it may depend on it: a `started`
// that failed transiently must not let its `ended` be rejected for good.
import { z } from "zod";

import type { Tx } from "../core/context";
import type { Refusal } from "../core/observe";
import { instant } from "../core/instant";
import type { AppUser } from "../core/resolve-user";
import { laborAck, laborPayloadV1, pushLaborEvent } from "./labor";
import { reportFailure, type ErrorReporter } from "../core/report";
import { SYNC_PROTOCOL_VERSIONS } from "./protocol";
import { measureSkew, type Skew } from "./reasons";

// A batch is the device's, so a cap protects the function, not the
// device: what is left out comes back next cycle. Vercel Pro allows 300 s by default (checked
// on vercel.com/docs/functions/configuring-functions/duration, 2026-11-05); a push stops
// starting records after 8 s, and one record waits at most 2 s for a lock and 4 s on a
// statement (trpc.ts, SYNC_TIMEOUTS), so a response is never held long enough to time the
// device out.
export const MAX_RECORDS = 100;
export const BUDGET_MS = 8_000;

// One kind today. The envelope keeps the field so a later kind is a new member here and a
// parser below, never a new wire shape.
const RECORD_KINDS = ["labor_event"] as const;
type Kind = (typeof RECORD_KINDS)[number];

// The envelope every record travels in: its id, what it is, the shape it was written in.
const envelope = z.strictObject({
  id: z.uuid({ version: "v7" }),
  kind: z.enum(RECORD_KINDS),
  schemaVersion: z.number().int().min(1),
  payload: z.unknown(),
});
const addressable = z.object({ id: z.uuid({ version: "v7" }) });

// Upcasters: each kind's payload at each version it was ever written in, to the current shape.
// Version 1 is the current one of every kind; a later version adds its parser here and keeps
// every older one, so an outbox written by an older build is accepted forever.
// Exported for the contract snapshot (test/contract/wire.test.ts) alone.
export const PAYLOADS = {
  labor_event: { 1: laborPayloadV1 },
} as const satisfies Record<Kind, Record<number, z.ZodType>>;

type Parsed = {
  kind: "labor_event";
  id: string;
  schemaVersion: number;
  payload: z.infer<typeof laborPayloadV1>;
};

// What one element of the batch is: a record to run, one answered `invalid_record` without a
// transaction, or one the batch stops before (no id to answer with, or a version this server
// does not know yet: retried after it upgrades, never condemned).
type Classified =
  | { kind: "run"; record: Parsed }
  | { kind: "invalid"; id: string; recordKind: Kind | null }
  | {
      kind: "stop";
      id: string | null;
      recordKind: Kind | null;
      code: "unreadable_record" | "unknown_schema_version";
    };

const kindOf = (raw: unknown): Kind | null => {
  const k = z.enum(RECORD_KINDS).safeParse((raw as { kind?: unknown } | null)?.kind);
  return k.success ? k.data : null;
};

function classify(raw: unknown): Classified {
  const env = envelope.safeParse(raw);
  if (!env.success) {
    const id = addressable.safeParse(raw);
    if (!id.success) {
      return {
        kind: "stop",
        id: null,
        recordKind: kindOf(raw),
        code: "unreadable_record",
      };
    }
    return { kind: "invalid", id: id.data.id, recordKind: kindOf(raw) };
  }
  const { id, kind, schemaVersion, payload } = env.data;
  const parser = (PAYLOADS[kind] as Record<number, z.ZodType>)[schemaVersion];
  if (parser === undefined) {
    return { kind: "stop", id, recordKind: kind, code: "unknown_schema_version" };
  }
  const p = parser.safeParse(payload);
  if (!p.success) return { kind: "invalid", id, recordKind: kind };
  return { kind: "run", record: { kind, id, schemaVersion, payload: p.data } as Parsed };
}

export const pushInput = z.strictObject({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSIONS),
  // The device's clock now, once per push: the one reading that says whether it is wrong.
  deviceNow: instant,
  records: z.array(z.unknown()).min(1).max(MAX_RECORDS),
});

const code = z.string().regex(/^[a-z_]+$/);
const kind = z.enum(RECORD_KINDS);
const success = z.enum(["accepted", "duplicate"]);

const pushResult = z.union([
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("labor_event"),
    result: success,
    ack: laborAck,
  }),
  z.strictObject({
    id: z.uuid(),
    kind: kind.nullable(),
    result: z.literal("rejected"),
    code,
    conflictingId: z.uuid().optional(),
  }),
]);

export type PushResult = z.infer<typeof pushResult>;

export const pushOutput = z.strictObject({
  serverNow: z.date(),
  clockSkewMs: z.number().int(),
  results: z.array(pushResult),
});

type PushOutput = z.infer<typeof pushOutput>;

// A caller transaction (trpc.ts, inCallerTransaction): the protected sequence, then `body`.
export type RunRecord = <T>(body: (tx: Tx, user: AppUser) => Promise<T>) => Promise<T>;

const rejectedAs = (r: { id: string; kind: Kind | null }, c: string): PushResult => ({
  id: r.id,
  kind: r.kind,
  result: "rejected",
  code: c,
});

async function runOne(tx: Tx, user: AppUser, r: Parsed, skew: Skew): Promise<PushResult> {
  const a = await pushLaborEvent(tx, user, r, skew);
  return a.result === "rejected"
    ? { id: r.id, kind: r.kind, ...a }
    : { id: r.id, kind: r.kind, result: a.result, ack: a.ack };
}

// A record that throws after an earlier one committed is answered by omission, so no handler
// sees it; this hands it to the reporter instead, after that
// record's transaction rolled back and while the request goes on. reportFailure classifies it:
// a mid-batch UNAUTHORIZED is an expected answer, never an incident.
export const reportRecordFailure =
  (reporter: ErrorReporter, requestId?: string) =>
  (error: unknown): void =>
    reportFailure(reporter, error, {
      source: "push_record",
      path: "sync.push",
      type: "mutation",
      requestId,
    });

// `clock` is the batch budget's; `onRecordFailure` receives what the loop swallows, and must
// not throw (reportRecordFailure never does). The budget running out is not a failure: those
// records are simply attempted next cycle.
export async function pushRecords(
  input: z.infer<typeof pushInput>,
  run: RunRecord,
  clock: () => number = Date.now,
  onRecordFailure: (error: unknown) => void = () => undefined,
  // Each record answered `rejected`, for the server's own log line (M4).
  onRefused: (r: Refusal) => void = () => undefined,
): Promise<PushOutput> {
  const started = clock();
  const serverNow = new Date(started);
  const skew = measureSkew(input.deviceNow, serverNow);
  const results: PushResult[] = [];
  // Records that ran a transaction. Until one has, a failure is the call's: a deactivated or
  // anonymous caller learns nothing, not even which records were malformed.
  let ran = 0;
  const answer = (result: PushResult) => {
    results.push(result);
    if (result.result === "rejected") {
      onRefused({ recordId: result.id, kind: result.kind, code: result.code });
    }
  };

  for (const raw of input.records) {
    if (clock() - started > BUDGET_MS) break;
    const c = classify(raw);
    if (c.kind === "stop") break;
    if (c.kind === "invalid") {
      answer(rejectedAs({ id: c.id, kind: c.recordKind }, "invalid_record"));
      continue;
    }
    const r = c.record;
    try {
      answer(await run((tx, user) => runOne(tx, user, r, skew)));
      ran++;
    } catch (error) {
      // A refusal is an answer, never a throw (sync/labor.ts returns `not_permitted`). So
      // UNAUTHORIZED (deactivated mid-batch) or anything thrown: this record and the rest are
      // left out and retried; what committed before is answered.
      if (ran === 0) throw error;
      onRecordFailure(error);
      break;
    }
  }
  // Nothing ran — every record malformed, or the first one of a version this server does not
  // know — so no transaction has resolved the caller yet. One does now, with no record in it:
  // an anonymous, uninvited or deactivated caller is UNAUTHORIZED here as anywhere, and learns
  // nothing about its batch.
  if (ran === 0) await run(async () => undefined);
  return { serverNow, clockSkewMs: skew.clockSkewMs, results };
}
