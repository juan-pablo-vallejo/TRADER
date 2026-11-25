import { JobsScreen } from "./jobs-screen";
import { signInPath } from "../../../server/identity-mode";
import { titled } from "../../i18n/server";

// Jobs: a dynamic server page rendering one client component, which calls the
// API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export const generateMetadata = () => titled((t) => t.nav.jobs);

export default function JobsPage() {
  return <JobsScreen signInHref={signInPath(process.env)} />;
}
