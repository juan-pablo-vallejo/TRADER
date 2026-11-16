// /api/trpc, the one HTTP entry point of the API (ARCHITECTURE, Web + API). On the Node
// runtime, because the pool and `pg` need it; dynamic, because every answer is per request.
import { getDb } from "../../../../server/db";
import { hitRateLimit, reportFailure } from "@trader/api";
import { TRPCError } from "@trpc/server";

import { webDirectory } from "../../../../server/directory";
import { originsFrom } from "../../../../server/edge";
import { createTrpcHandler } from "../../../../server/handler";
import { webIdentity } from "../../../../server/identity";
import { webMailer } from "../../../../server/mailer";
import { webReporter } from "../../../../server/reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createTrpcHandler({
  getDb,
  identity: webIdentity,
  directory: webDirectory,
  mailer: webMailer,
  reporter: webReporter,
  edge: {
    limiter: (rule, value) => hitRateLimit(getDb(), rule, value),
    authorizedOrigins: originsFrom(process.env),
    // The limiter is ours: its failure is an incident, reported as one, and no refusal.
    onLimiterFailure: (cause) =>
      reportFailure(
        webReporter,
        new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause }),
        { source: "request", path: "rate-limit", type: "query" },
      ),
  },
});

export { handler as GET, handler as POST };
