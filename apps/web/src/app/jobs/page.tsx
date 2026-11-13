import { JobsScreen } from "./jobs-screen";
import { signInPath } from "../../server/identity-mode";

// Jobs (TASKS, Stage 4): a dynamic server page rendering one client component, which calls the
// API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function JobsPage() {
  return <JobsScreen signInHref={signInPath(process.env)} />;
}
