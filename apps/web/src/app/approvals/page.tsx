import { ApprovalsScreen } from "./approvals-screen";
import { signInPath } from "../../server/identity-mode";

// The approval queue (TASKS, Stage 4: approval queue screen): a dynamic server page rendering
// one client component, which calls the API through the route handler.
export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  return <ApprovalsScreen signInHref={signInPath(process.env)} />;
}
