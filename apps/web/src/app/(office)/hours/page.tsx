import { HoursScreen } from "./hours-screen";
import { signInPath } from "../../../server/identity-mode";

// Hours: a week of every person's hours, and a person's day in a side panel, with the
// correcting-entry editor inside it. A dynamic server page rendering client components, which
// call the API through the route handler.
export const dynamic = "force-dynamic";

export default function HoursPage() {
  const signInHref = signInPath(process.env);
  return <HoursScreen signInHref={signInHref} />;
}
