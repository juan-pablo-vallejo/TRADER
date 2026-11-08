import { devIdentityEnabled } from "@trader/api";

import { JobsScreen } from "./jobs-screen";

// Jobs (TASKS, Stage 4): a dynamic server page rendering one client component, which calls the
// API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function JobsPage() {
  return <JobsScreen devSignIn={devIdentityEnabled(process.env)} />;
}
