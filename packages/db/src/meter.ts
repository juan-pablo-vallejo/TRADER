// The statement meter: how many statements one procedure call sent, counted as Drizzle hands
// each to the driver (its logger hook), transaction control included. It observes only: the
// hook returns at once, awaits nothing and touches no query, so a metered call behaves
// exactly as an unmetered one. The count lives in an AsyncLocalStorage store, so calls that
// run at once (a tRPC batch, concurrent tests) each count only their own statements.
// Consumed by the API's timing middleware (core/trpc.ts) and its statement budgets.
import { AsyncLocalStorage } from "node:async_hooks";

import type { Logger } from "drizzle-orm/logger";

type Count = { statements: number };

const current = new AsyncLocalStorage<Count>();

// Every Db this package creates logs through this (client.ts). Outside `metered`, a no-op.
export const statementLogger: Logger = {
  logQuery() {
    const count = current.getStore();
    if (count !== undefined) count.statements++;
  },
};

// Runs `body` with a count of its own and returns what it returned, with the count.
export async function metered<T>(
  body: () => Promise<T>,
): Promise<{ value: T; statements: number }> {
  const count: Count = { statements: 0 };
  const value = await current.run(count, body);
  return { value, statements: count.statements };
}
