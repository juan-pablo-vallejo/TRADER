// An address with no screen: the empty state, one sentence and one action.
import Link from "next/link";

import { EmptyState } from "./failure";
import { requestStrings } from "./i18n/server";

export default async function NotFound() {
  const { t } = await requestStrings();
  return (
    <EmptyState
      text={t.notFound}
      action={<Link href="/schedule">{t.goToSchedule}</Link>}
    />
  );
}
