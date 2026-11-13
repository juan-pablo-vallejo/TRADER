import { CloseoutScreen } from "./closeout-screen";
import { signInPath } from "../../server/identity-mode";

// The office's day closeout (TASKS, Stage 4: admin closeout, V1-D08): a dynamic server page
// rendering one client component, which calls the API through the route handler.
export const dynamic = "force-dynamic";

export default function CloseoutPage() {
  return <CloseoutScreen signInHref={signInPath(process.env)} />;
}
