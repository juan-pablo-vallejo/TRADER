import { PeopleScreen } from "./people-screen";
import { signInPath } from "../../../server/identity-mode";
import { titled } from "../../i18n/server";

// People: a dynamic server page rendering one client component, which calls the API through
// the route handler like the phone does.
export const dynamic = "force-dynamic";

export const generateMetadata = () => titled((t) => t.nav.people);

export default function PeoplePage() {
  return <PeopleScreen signInHref={signInPath(process.env)} />;
}
