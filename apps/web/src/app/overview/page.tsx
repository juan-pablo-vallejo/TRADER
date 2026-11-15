import { signInPath } from "../../server/identity-mode";
import { OverviewScreen } from "./overview-screen";

// The Overview (TASKS A01): a dynamic server page rendering one client component, which
// calls the API through the route handler.
export const dynamic = "force-dynamic";

export default function OverviewPage() {
  return <OverviewScreen signInHref={signInPath(process.env)} />;
}
