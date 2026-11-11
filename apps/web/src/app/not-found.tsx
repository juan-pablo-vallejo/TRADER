// An address with no screen (DESIGN, Empty state: one sentence and one action).
import Link from "next/link";

import { EmptyState } from "./failure";
import { strings } from "./strings";

export default function NotFound() {
  return (
    <EmptyState
      text={strings.notFound}
      action={<Link href="/jobs">{strings.goToJobs}</Link>}
    />
  );
}
