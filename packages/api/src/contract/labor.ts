// A labor event as a device sends it, and the server's acknowledgement of one.
// Part of the client-safe contract: the phone builds its outbox records to
// this shape and the server parses them with the same schema.
import { z } from "zod";

import { DEVICE_EVENT_TYPES, ENTRY_FLAGS } from "./enums";
import { instant } from "./instant";

// Schema version 1 of a labor event's payload. Nothing names a company, an initiator, a
// receipt stamp or a skew: those are the server's. No corrections or voids from a
// device: the office writes those (labor.repair).
export const laborPayloadV1 = z.strictObject({
  workerId: z.uuid(),
  jobId: z.uuid(),
  type: z.enum(DEVICE_EVENT_TYPES),
  clientTimestamp: instant,
  location: z
    .strictObject({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyM: z.number().nonnegative().nullable(),
    })
    .nullable(),
  timeSetByUser: z.boolean(),
  capturedOffline: z.boolean(),
});

export type LaborPayload = z.infer<typeof laborPayloadV1>;

export const laborAck = z.strictObject({
  id: z.uuid(),
  serverTimestamp: z.date(),
  clockSkewed: z.boolean(),
  reasons: z.array(z.enum(ENTRY_FLAGS)),
});
