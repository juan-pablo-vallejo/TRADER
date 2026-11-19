// An address with no screen: the empty state, one sentence and one action.
import Link from "next/link";

import { EmptyState } from "./failure";
import { strings } from "./strings";

export default function NotFound() {
  return (
    <EmptyState
      text={strings.notFound}
      action={<Link href="/schedule">{strings.goToSchedule}</Link>}
    />
  );
}
