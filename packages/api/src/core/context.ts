// The request context: one per HTTP request, shared by every call in a tRPC batch. It does no
// database I/O. Each protected procedure opens its own transaction from `db` (trpc.ts), so
// one call in a batch never shares a transaction, or a failure, with another.
import type { Db } from "@trader/db";

import {
  verifiedIdentitySchema,
  type IdentityDirectory,
  type VerifiedIdentity,
} from "./identity";
import { type Mailer, unconfiguredMailer } from "./mailer";
import { ignoreCalls, type CallObserver } from "./observe";
import type { ErrorReporter } from "./report";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type DemoDoor = {
  // The code a caller must present. Never logged, never answered.
  code: string;
  // The one company whose people the door admits.
  companyId: string;
  // A single-use sign-in ticket for the admitted person: their login (`subject`, the row's
  // identity_subject), or, for an invitation not yet signed in (null), whoever holds `phone`
  // at the identity provider. Null when it has none to give. May throw: the network, never
  // a verdict.
  ticket(person: { phone: string; subject: string | null }): Promise<string | null>;
};

// The company that reaches nobody outside this deployment: the door's company, in
// production (the host says when: apps/web, clerk-demo.ts). Its code is shared by design,
// so whoever holds it can sign in as any of its people, its admin included, and must be
// harmless: its invoices are emailed only to `allowed` (the deployment's allow-list;
// blank is nobody), and it invites nobody (people/invite.ts), since an invitation makes a
// login for any number. Null everywhere else, staging included: no rule changes there.
export type ClosedCompany = { companyId: string; allowed: readonly string[] };

// `reporter` is a stateless sink (report.ts) that procedures use for failures they answer
// themselves; it holds no identity and no request state. Required, so a handler cannot forget it.
// `requestId` is the HTTP request's: made by the handler, never read from the client, shared
// by every call in a batch. It names a request in an error report.
// `directory` is the identity provider as people.invite sees it (identity.ts); required for the
// same reason, so no host can invite a person the provider was never told about.
export type Context = {
  db: Db;
  identity: VerifiedIdentity | null;
  directory: IdentityDirectory;
  // The mail service as invoice.send and people.sendInvitation see it (mailer.ts). A host
  // that names none gets one that sends nothing and says so.
  mailer: Mailer;
  // Where the app is got from on this host, as an emailed invitation links to it: the
  // host's own configured address, never anything of a request. Null where the host names
  // none, and then no invitation is emailed.
  getAppUrl: string | null;
  // The Demo sign-in's door (demo-door.ts), or null on a host that has none: then
  // demo.signIn refuses everyone.
  demo: DemoDoor | null;
  // The company that reaches nobody outside (demo-door.ts), or null: only a production
  // host with a Demo door names one.
  closed: ClosedCompany | null;
  reporter: ErrorReporter;
  requestId: string;
  // Where each call's timing line goes (observe.ts). A host that names none drops them.
  observe: CallObserver;
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
  mailer?: Mailer;
  getAppUrl?: string | null;
  demo?: DemoDoor | null;
  closed?: ClosedCompany | null;
  reporter: ErrorReporter;
  requestId: string;
  observe?: CallObserver;
  waits?: CallerWaits;
}): Context {
  const parsed = verifiedIdentitySchema.safeParse(opts.identity);
  return {
    db: opts.db,
    identity: parsed.success ? parsed.data : null,
    directory: opts.directory,
    mailer: opts.mailer ?? unconfiguredMailer,
    getAppUrl: opts.getAppUrl ?? null,
    demo: opts.demo ?? null,
    closed: opts.closed ?? null,
    reporter: opts.reporter,
    requestId: opts.requestId,
    observe: opts.observe ?? ignoreCalls,
    ...(opts.waits !== undefined && { waits: opts.waits }),
  };
}
