import { EntriesSection } from "./entries-screen";
import { HoursScreen } from "./hours-screen";
import { signInPath } from "../../server/identity-mode";

// Hours: each worker's day by job for a range of dates, and beneath it one person's entries
// with the correcting-entry editor. A dynamic server page rendering client components, which
// call the API through the route handler.
export const dynamic = "force-dynamic";

export default function HoursPage() {
  const signInHref = signInPath(process.env);
  return (
    <>
      <HoursScreen signInHref={signInHref} />
      <EntriesSection signInHref={signInHref} />
    </>
  );
}
