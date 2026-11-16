// An instant a client may send: any date Postgres can store (ARCHITECTURE, bounded client
// instants). Part of the client-safe contract.
import { z } from "zod";

export const INSTANT_MIN = new Date("0001-01-01T00:00:00.000Z");
export const INSTANT_MAX = new Date("9999-12-31T23:59:59.999Z");

export const instant = z.date().min(INSTANT_MIN).max(INSTANT_MAX);
