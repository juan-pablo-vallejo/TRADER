// Deterministic labor events for the fold, validation and work-date tests. Nothing here reads
// a clock or a random source, so every run folds the same timeline.
import type { EventType, LaborEvent } from "../src/labor/fold";

export const WORKER = "0190d000-0000-7000-8000-00000000a001";
export const JOB_A = "0190d000-0000-7000-8000-00000000b001";
export const JOB_B = "0190d000-0000-7000-8000-00000000b002";

// A valid UUIDv7: 48 bits of milliseconds, version 7, a 12-bit sequence, variant 10. Ids
// built later in a test carry a higher sequence, so they sort later at equal milliseconds.
export function v7(ms: number, seq: number): string {
  const hex = ms.toString(16).padStart(12, "0");
  const s = (seq & 0xfff).toString(16).padStart(3, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${s}-8000-000000000000`;
}

// 2026-10-05, a Monday in EDT; times are UTC unless a test says otherwise.
export const at = (hhmm: string, day = "2026-10-05") => new Date(`${day}T${hhmm}:00Z`);

type Options = {
  job?: string;
  worker?: string;
  // Receipt. Defaults to the device time: an online, correctly clocked capture.
  server?: Date;
  skewed?: boolean;
  corrects?: string;
  voids?: string;
  id?: string;
};

// One builder per test, so the sequence restarts and ids stay reproducible.
export function builder() {
  let seq = 0;
  return function ev(type: EventType, client: Date, o: Options = {}): LaborEvent {
    const server = o.server ?? client;
    return {
      id: o.id ?? v7(server.getTime(), ++seq),
      workerId: o.worker ?? WORKER,
      jobId: o.job ?? JOB_A,
      type,
      clientTimestamp: client,
      serverTimestamp: server,
      clockSkewed: o.skewed ?? false,
      voidsEventId: o.voids ?? null,
      correctsEventId: o.corrects ?? null,
    };
  };
}

export const HOUR = 3_600_000;
export const MINUTE = 60_000;
