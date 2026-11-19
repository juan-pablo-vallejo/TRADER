// The readiness check (ARCHITECTURE, Before the first deployment: "a readiness check that
// touches the database and the role"). One transaction on one pooled connection: it reaches
// the database, and it holds that connection to the rule every protected call is held to.
// On a deployment that rule is the login itself (db guard.ts, assertLoginRole): trader_app,
// no superuser, no BYPASSRLS, every tenant table forced. Development and the tests reach
// trader_app by a startup option over the compose superuser (db.ts), so there it is the
// runtime guard alone.
// The answer is a boolean and the commit the deployment was built from, and nothing else:
// the route is public, and why a deployment is not ready belongs in the error report, not
// in a response anyone can read. The commit is the platform's own variable, a public
// repository's public fact; the deploy job reads it to know which revision is serving
// (.github/workflows/ci.yml). Anything that is not a full commit id is
// answered as null. Each probe is one cheap query; rate limits are the edge's (TASKS,
// Stage 6).
// Dependencies are passed in, as in handler.ts; the route wires the real ones.
import { randomUUID } from "node:crypto";

import { reportFailure, type ErrorReporter } from "@trader/api";
import { assertLoginRole, assertRuntimeRole, type Db } from "@trader/db";

export type ReadyDependencies = {
  getDb: () => Db;
  reporter: ErrorReporter;
  env: Record<string, string | undefined>;
};

const commitOf = (env: Record<string, string | undefined>): string | null => {
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? "";
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
};

export function createReadyHandler(deps: ReadyDependencies) {
  return async (): Promise<Response> => {
    let ready = false;
    try {
      const deployed = deps.env.NODE_ENV === "production";
      await deps.getDb().transaction(async (tx) => {
        await (deployed ? assertLoginRole(tx) : assertRuntimeRole(tx));
      });
      ready = true;
    } catch (error) {
      reportFailure(deps.reporter, error, {
        source: "request",
        path: "ready",
        type: "query",
        requestId: randomUUID(),
      });
    }
    return Response.json(
      { ready, commit: commitOf(deps.env) },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  };
}
