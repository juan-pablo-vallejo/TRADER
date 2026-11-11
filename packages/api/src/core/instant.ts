// An instant a client asserts. A JS Date spans ±275,760 years; Postgres and ISO 8601 text stop
// at year 9999, so a Date beyond it parses here and then throws inside the transaction: for a
// push that is a record omitted and retried for ever, blocking the outbox behind it. Bounded
// at the boundary instead, where it is `invalid_record` (permanent) or BAD_REQUEST. The lower
// bound is year 1, the earliest ISO 8601 text Postgres reads back: a phone with a dead clock
// (1970, or before it) still reports, and whether a time is plausible is the approval rule's
// question (ARCHITECTURE, Sync protocol).
import { z } from "zod";

export const INSTANT_MIN = new Date("0001-01-01T00:00:00.000Z");
export const INSTANT_MAX = new Date("9999-12-31T23:59:59.999Z");

export const instant = z.date().min(INSTANT_MIN).max(INSTANT_MAX);
