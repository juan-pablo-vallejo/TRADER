// A tap, written to the phone's store and nowhere else: no network on this path. The
// provider calls it and draws what it answers.
//
// Read from the store, not from what is drawn: two quick taps are two captures, and a tap
// that lands while a cycle is replacing the snapshot and pruning the records it now shows
// must see both as the store has them, never one of each. The records first, the snapshot
// after: a cycle writes its snapshot before it prunes (engine.ts), so records read first
// are never fewer than that snapshot accounts for.
import type { LaborPayload } from "@trader/api/contract";

import { clockState, recordsFor, type Tap } from "./clock";
import { READING_KEY, readSnapshot } from "./engine";
import { stampsOn } from "./today";
import type { Store } from "./types";

export type Captured =
  // Written: the tap counts, and a cycle will send it.
  | "saved"
  // Nothing to write from where the clock stands, or nobody known on this phone yet.
  | "none"
  // The store threw: nothing was written, and the person is told to try again.
  | "failed";

export async function capture(
  store: Store,
  what: Tap,
  deps: {
    now: () => number;
    mint: (now: number) => string;
    // A position already in hand for this moment, or null.
    location: (now: number) => LaborPayload["location"];
    // A store that throws is a fault of the phone's, and worth a report.
    report: (error: unknown) => void;
  },
): Promise<Captured> {
  try {
    const me = (await readSnapshot(store))?.data.me.id;
    if (me === undefined) return "none";
    const now = deps.now();
    const mine = await store.records(me);
    const kept = await readSnapshot(store);
    if (kept === null || kept.data.me.id !== me) return "none";
    const reading = await store.read(READING_KEY);
    const written = recordsFor(what, clockState(kept.data, mine), {
      me,
      now,
      reading: reading === null ? null : Number(reading),
      // Off for this person: nothing is sent, whatever reading is in hand.
      location: stampsOn(kept.data) ? deps.location(now) : null,
      mint: deps.mint,
    });
    if (written.length === 0) return "none";
    // All of them or none (types.ts, append): a job switch is never half written.
    await store.append(written);
    return "saved";
  } catch (error) {
    deps.report(error);
    return "failed";
  }
}
