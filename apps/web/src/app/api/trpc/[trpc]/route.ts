// /api/trpc, the one HTTP entry point of the API. On the Node
// runtime, because the pool and `pg` need it; dynamic, because every answer is per request.
import { getAppUrl } from "../../../../server/addresses";
import { webClosed, webDemo } from "../../../../server/clerk-demo";
import { getDb } from "../../../../server/db";
import { webDirectory } from "../../../../server/directory";
import { originsFrom } from "../../../../server/edge";
import { answersTimings } from "../../../../server/environment";
import { traceCall } from "../../../../server/call-trace";
import { createTrpcHandler, logToStdout } from "../../../../server/handler";
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
  getAppUrl: () => getAppUrl(process.env),
  demo: webDemo,
  closed: webClosed,
  reporter: webReporter,
  edge: { authorizedOrigins: originsFrom(process.env) },
  // Each call's line to the log and, on staging, to the tracing trial (call-trace.ts).
  logCall: (line) => {
    logToStdout(line);
    traceCall(line);
  },
  timingHeaders: () => answersTimings(process.env),
});

export { handler as GET, handler as POST };
