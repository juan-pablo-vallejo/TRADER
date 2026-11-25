// An address with no screen: its own title, the sentence as the page's heading, and one
// action. A not-found page takes no metadata export, so the title is rendered here.
import Link from "next/link";

import controls from "./controls.module.css";
import { requestStrings } from "./i18n/server";

export default async function NotFound() {
  const { t } = await requestStrings();
  return (
    <div>
      <title>{`${t.notFound} · TRADER`}</title>
      <h1 className="heading">{t.notFound}</h1>
      <Link className={controls.linkTarget} href="/schedule">
        {t.goToSchedule}
      </Link>
    </div>
  );
}
