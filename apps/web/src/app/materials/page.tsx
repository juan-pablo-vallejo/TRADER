import { devIdentityEnabled } from "@trader/api";

import { MaterialsScreen } from "./materials-screen";

// Material cost entry (TASKS, Stage 4: material cost entry by the office): a dynamic server
// page rendering one client component, which calls the API through the route handler.
export const dynamic = "force-dynamic";

export default function MaterialsPage() {
  return <MaterialsScreen devSignIn={devIdentityEnabled(process.env)} />;
}
