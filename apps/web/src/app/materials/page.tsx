import { MaterialsScreen } from "./materials-screen";
import { signInPath } from "../../server/identity-mode";

// Material cost entry (TASKS, Stage 4: material cost entry by the office): a dynamic server
// page rendering one client component, which calls the API through the route handler.
export const dynamic = "force-dynamic";

export default function MaterialsPage() {
  return <MaterialsScreen signInHref={signInPath(process.env)} />;
}
