// The request context: one per HTTP request, shared by every call in a tRPC batch. It does no
// database I/O. Each protected procedure opens its own transaction from `db` (trpc.ts), so
// one call in a batch never shares a transaction, or a failure, with another.
import type { Db } from "@trader/db";

import {
  verifiedIdentitySchema,
  type IdentityDirectory,
  type VerifiedIdentity,
} from "./identity";
import type { ErrorReporter } from "./report";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// `reporter` is a stateless sink (report.ts) that procedures use for failures they answer
// themselves; it holds no identity and no request state. Required, so a handler cannot forget it.
// `requestId` is the HTTP request's: made by the handler, never read from the client, shared
// by every call in a batch. It names a request in an error report and a diagnostic line.
// `directory` is the identity provider as roster.invite sees it (identity.ts); required for the
// same reason, so no host can invite a person the provider was never told about.
export type Context = {
  db: Db;
  identity: VerifiedIdentity | null;
  directory: IdentityDirectory;
  reporter: ErrorReporter;
  requestId: string;
  waits?: CallerWaits;
};

// How long a caller transaction waits for a lock and on a statement (trpc.ts). A handler
// leaves `waits` unset and gets the defaults. `inherit` writes neither setting: for a caller
// whose `db` is already a transaction that owns them, which is how the suites call a
// procedure inside a rolled-back transaction with a short wait of their own.
export type CallerTimeouts = { lockTimeout: string; statementTimeout: string };
export type CallerWaits = CallerTimeouts | "inherit";

// `identity` is what an IdentityAdapter returned. Parsed again here, because this is the
// boundary every adapter crosses: anything that is not a verified identity is no identity.
export function createContext(opts: {
  db: Db;
  identity: unknown;
  directory: IdentityDirectory;
  reporter: ErrorReporter;
  requestId: string;
  waits?: CallerWaits;
}): Context {
  const parsed = verifiedIdentitySchema.safeParse(opts.identity);
  return {
    db: opts.db,
    identity: parsed.success ? parsed.data : null,
    directory: opts.directory,
    reporter: opts.reporter,
    requestId: opts.requestId,
    ...(opts.waits !== undefined && { waits: opts.waits }),
  };
}
