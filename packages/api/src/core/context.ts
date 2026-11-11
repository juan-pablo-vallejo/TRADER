// The request context: one per HTTP request, shared by every call in a tRPC batch. It does no
// database I/O. Each protected procedure opens its own transaction from `db` (trpc.ts), so
// one call in a batch never shares a transaction, or a failure, with another.
import type { Db } from "@trader/db";

import { verifiedIdentitySchema, type VerifiedIdentity } from "./identity";
import type { ErrorReporter } from "./report";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// `reporter` is a stateless sink (report.ts) that procedures use for failures they answer
// themselves; it holds no identity and no request state. Required, so a handler cannot forget it.
export type Context = {
  db: Db;
  identity: VerifiedIdentity | null;
  reporter: ErrorReporter;
};

// `identity` is what an IdentityAdapter returned. Parsed again here, because this is the
// boundary every adapter crosses: anything that is not a verified identity is no identity.
export function createContext(opts: {
  db: Db;
  identity: unknown;
  reporter: ErrorReporter;
}): Context {
  const parsed = verifiedIdentitySchema.safeParse(opts.identity);
  return {
    db: opts.db,
    identity: parsed.success ? parsed.data : null,
    reporter: opts.reporter,
  };
}
