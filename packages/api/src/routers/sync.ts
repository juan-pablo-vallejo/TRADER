import { workSessionEvents } from "@trader/db";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";

import { checkLegality, orderEvents, type FoldEvent } from "../sync/fold";
import { clockSkewMs, isClockTrusted, PULL_BATCH_SIZE } from "../sync/protocol";
import type { PushResult } from "../sync/types";
import { protectedProcedure, router } from "../trpc";

/**
 * The sync boundary. logic.md's CONFLICT preamble requires this to be **one
 * readable handler at the API boundary** — deliberately not a database constraint
 * and not a locking scheme — so the ordering, legality and skew rules all live
 * here where they can be read together.
 */

const eventTypes = ["started", "paused", "resumed", "ended", "voided"] as const;
const attestationLevels = ["biometric", "device_credential", "none"] as const;

const incomingEvent = z.object({
  /**
   * Client-generated UUIDv7 (SPEC §3). Not defaulted server-side on purpose: the
   * value must come from the device that observed the event, and a server-side
   * default would mask a client bug by silently making every retry a new row.
   */
  id: z.uuid(),
  jobId: z.uuid(),
  type: z.enum(eventTypes),
  clientTimestamp: z.date(),
  /** ATTEST-3. Absent means the client predates attestation; `none` is honest. */
  attestationLevel: z.enum(attestationLevels).default("none"),
  deviceLat: z.number().min(-90).max(90).nullable().default(null),
  deviceLng: z.number().min(-180).max(180).nullable().default(null),
  deviceAccuracyM: z.number().nonnegative().nullable().default(null),
  payload: z.record(z.string(), z.unknown()).nullable().default(null),
});

export const syncRouter = router({
  /**
   * Push a batch of locally-recorded events.
   *
   * Per-record results rather than an all-or-nothing batch: one illegal event
   * must not discard the legal ones beside it, or a single client bug would cost
   * a worker their whole day. CONFLICT-6's per-record status in the UI depends on
   * this shape.
   */
  push: protectedProcedure
    .input(
      z.object({
        /**
         * The device's clock *now*, not per event — CONFLICT-4. This is the only
         * value that says whether the clock is wrong, as opposed to the event
         * merely being old.
         */
        deviceNow: z.date(),
        events: z.array(incomingEvent).min(1).max(500),
      }),
    )
    .mutation(
      async ({ ctx, input }): Promise<{ results: PushResult[]; skewMs: number }> => {
        const serverNow = new Date();
        const skewMs = clockSkewMs(input.deviceNow, serverNow);
        const trusted = isClockTrusted(skewMs);

        // A worker may only write their own labor. `initiator_user_id` records who
        // caused the event; corrections by an admin arrive through Phase 3's path,
        // not here.
        const workerId = ctx.user.id;

        // The worker's existing events, loaded once. Legality is judged against the
        // whole timeline (SESSION-3), and re-reading per event would be both slow
        // and — worse — inconsistent within a batch.
        const existing: FoldEvent[] = await ctx.db
          .select({
            id: workSessionEvents.id,
            workerId: workSessionEvents.workerId,
            jobId: workSessionEvents.jobId,
            type: workSessionEvents.type,
            clientTimestamp: workSessionEvents.clientTimestamp,
            serverTimestamp: workSessionEvents.serverTimestamp,
          })
          .from(workSessionEvents)
          .where(eq(workSessionEvents.workerId, workerId));

        const known = new Set(existing.map((e) => e.id));
        const timeline = [...existing];
        const results: PushResult[] = [];

        // Sorted by client_timestamp so a batch containing `started` and `paused`
        // together is judged in the order it happened, not the order it was sent.
        for (const event of orderEvents(
          input.events.map((e) => ({
            ...e,
            workerId,
            // Untrusted clocks order by arrival instead (CONFLICT-4). The recorded
            // client_timestamp below is still the device's, never clamped.
            serverTimestamp: serverNow,
          })),
        )) {
          if (known.has(event.id)) {
            results.push({ id: event.id, status: "duplicate" });
            continue;
          }

          const candidate: FoldEvent = {
            id: event.id,
            workerId,
            jobId: event.jobId,
            type: event.type,
            // CONFLICT-4: a distrusted clock loses its power to *order* history,
            // so legality and folding use arrival time — but the stored
            // client_timestamp remains what the device reported.
            clientTimestamp: trusted ? event.clientTimestamp : serverNow,
            serverTimestamp: serverNow,
          };

          const legality = checkLegality(timeline, candidate);
          if (!legality.ok) {
            results.push({
              id: event.id,
              status: "rejected",
              reason: legality.reason,
              ...(legality.conflictingEventId
                ? { conflictingEventId: legality.conflictingEventId }
                : {}),
            });
            continue;
          }

          const source = input.events.find((e) => e.id === event.id)!;
          await ctx.db
            .insert(workSessionEvents)
            .values({
              id: event.id,
              companyId: ctx.user.companyId,
              workerId,
              jobId: event.jobId,
              type: event.type,
              clientTimestamp: source.clientTimestamp,
              initiatorUserId: workerId,
              attestationLevel: source.attestationLevel,
              deviceLat: source.deviceLat,
              deviceLng: source.deviceLng,
              deviceAccuracyM: source.deviceAccuracyM,
              payload: trusted
                ? source.payload
                : // Flagged rather than silently accepted, so the office can see
                  // *why* an event ordered oddly. CONFLICT-4 forbids clamping.
                  { ...(source.payload ?? {}), clockSkewMs: skewMs, clockTrusted: false },
            })
            // CONFLICT-1: concurrent pushes of the same id race here; the loser
            // does nothing and the event is still recorded exactly once.
            .onConflictDoNothing({ target: workSessionEvents.id });

          known.add(event.id);
          timeline.push(candidate);
          results.push({ id: event.id, status: "accepted" });
        }

        return { results, skewMs };
      },
    ),

  /**
   * Pull events the device has not seen, oldest-first (CONFLICT-6).
   *
   * The cursor is a keyset on `(server_timestamp, id)` re-read with an overlap
   * window — CONFLICT-4a. Callers must treat redelivery as normal.
   */
  pull: protectedProcedure
    .input(
      z.object({
        /** Null on a device's first ever pull, which then reads from the start. */
        cursor: z
          .object({ serverTimestamp: z.date(), id: z.uuid() })
          .nullable()
          .default(null),
        limit: z.number().int().min(1).max(PULL_BATCH_SIZE).default(PULL_BATCH_SIZE),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Company-scoped, not worker-scoped: a foreman's device needs their crew's
      // events to fold a crew view. The company boundary is the tenancy seam.
      const scope = eq(workSessionEvents.companyId, ctx.user.companyId);

      /**
       * A strict keyset: `(server_timestamp, id)` greater than the cursor.
       *
       * Strict, not overlapping, and that distinction matters. The CONFLICT-4a
       * overlap belongs at the *start of a sync cycle*, not inside pagination —
       * a page that always began a window behind its own cursor could never
       * advance whenever a full batch fit inside that window, and the client
       * would re-read the same page forever. Pagination must terminate; the
       * re-read is `rewindCursor` in `sync/protocol.ts`, applied once per cycle.
       */
      const where = input.cursor
        ? and(
            scope,
            or(
              gt(workSessionEvents.serverTimestamp, input.cursor.serverTimestamp),
              and(
                eq(workSessionEvents.serverTimestamp, input.cursor.serverTimestamp),
                gt(workSessionEvents.id, input.cursor.id),
              ),
            ),
          )
        : scope;

      const rows = await ctx.db
        .select()
        .from(workSessionEvents)
        .where(where)
        .orderBy(asc(workSessionEvents.serverTimestamp), asc(workSessionEvents.id))
        .limit(input.limit);

      const last = rows[rows.length - 1];

      return {
        events: rows,
        /**
         * Paginate within this cycle until null, which means caught up.
         *
         * When the cycle ends, the client must store `rewindCursor(lastSeen)` —
         * not this value — so the next cycle re-reads the CONFLICT-4a overlap
         * window and picks up anything that committed late.
         */
        nextCursor:
          rows.length === input.limit && last
            ? { serverTimestamp: last.serverTimestamp, id: last.id }
            : null,
      };
    }),
});
