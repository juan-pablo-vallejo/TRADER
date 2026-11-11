// An instant a client asserts. A JS Date spans ±275,760 years; Postgres and ISO 8601 text stop
// at year 9999, so a Date beyond it parses here and then throws inside the transaction: for a
// push that is a record omitted and retried for ever, blocking the outbox behind it. Bounded
// at the boundary instead, where it is `invalid_record` (permanent) or BAD_REQUEST. The lower
// bound is the epoch, not a plausible year: a phone with a dead clock still reports, and
// whether a time is plausible is the approval rule's question (ARCHITECTURE, Sync protocol).
import { z } from "zod";

export const INSTANT_MIN = new Date(0);
export const INSTANT_MAX = new Date("9999-12-31T23:59:59.999Z");

export const instant = z.date().min(INSTANT_MIN).max(INSTANT_MAX);
