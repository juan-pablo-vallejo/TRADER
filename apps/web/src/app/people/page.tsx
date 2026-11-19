import { PeopleScreen } from "./people-screen";
import { signInPath } from "../../server/identity-mode";

// People: a dynamic server page rendering one client component, which calls the API through
// the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function PeoplePage() {
  return <PeopleScreen signInHref={signInPath(process.env)} />;
}
