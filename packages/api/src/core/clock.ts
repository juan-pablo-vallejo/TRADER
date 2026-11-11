// The server's clock inside a transaction, to the millisecond. `clock_timestamp()` is the
// wall clock at the statement, not `now()`, which is the transaction's start and so precedes
// anything the caller waited behind: every stamp that must sort after a lock is read here,
// after that lock. With `after`, the stamp is floored at `after` + 1 ms, so a series of
// stamps rises in acceptance order even when the clock steps back. Epoch milliseconds cross
// the driver as text; the columns hold milliseconds (precision 3). Consumed by
// labor/timeline.ts, closeout/submit.ts, approvals/decide.ts and materials/correct.ts.
import { sql } from "drizzle-orm";

import type { Tx } from "./context";

export async function serverClock(tx: Tx, after: Date | null = null): Promise<Date> {
  const { rows } = await tx.execute<{ now_ms: string }>(sql`
    select (extract(epoch from date_trunc('milliseconds', greatest(
      clock_timestamp(),
      ${after?.toISOString() ?? null}::timestamptz + interval '1 millisecond'
    ))) * 1000)::bigint as now_ms
  `);
  const ms = rows[0]?.now_ms;
  if (ms === undefined) throw new Error("no server clock returned");
  return new Date(Number(ms));
}
