import { devIdentityEnabled } from "@trader/api";

import { AssignmentsScreen } from "./assignments-screen";

// Assignments (TASKS, Stage 4: dated worker-job assignments): a dynamic server page rendering
// one client component, which calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function AssignmentsPage() {
  return <AssignmentsScreen devSignIn={devIdentityEnabled(process.env)} />;
}
