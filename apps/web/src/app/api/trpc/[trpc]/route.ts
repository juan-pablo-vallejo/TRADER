// /api/trpc, the one HTTP entry point of the API. On the Node
// runtime, because the pool and `pg` need it; dynamic, because every answer is per request.
import { getAppUrl } from "../../../../server/addresses";
import { webClosed, webDemo } from "../../../../server/clerk-demo";
import { getDb } from "../../../../server/db";
import { webDirectory } from "../../../../server/directory";
import { originsFrom } from "../../../../server/edge";
import { traderEnvironment } from "../../../../server/environment";
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
  getAppUrl: () => getAppUrl(process.env),
  demo: webDemo,
  closed: webClosed,
  reporter: webReporter,
  edge: { authorizedOrigins: originsFrom(process.env) },
  // Timings and the request id are answered to a caller everywhere but production.
  timingHeaders: () => traderEnvironment(process.env) !== "production",
});

export { handler as GET, handler as POST };
