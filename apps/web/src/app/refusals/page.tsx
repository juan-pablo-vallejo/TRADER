import { RefusalsScreen } from "./refusals-screen";
import { signInPath } from "../../server/identity-mode";

// Refused entries (TASKS, Stage 4: rejected-record diagnostics): a dynamic server page
// rendering one client component, which calls the API through the route handler.
export const dynamic = "force-dynamic";

export default function RefusalsPage() {
  return <RefusalsScreen signInHref={signInPath(process.env)} />;
}
