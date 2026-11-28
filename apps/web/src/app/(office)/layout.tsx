import type { ReactNode } from "react";

import { Header } from "../header";
import { requestStrings } from "../i18n/server";
import { MAIN_ID } from "../main-id";
import { KeyboardRows } from "../keyboard-rows";
import { Nav } from "../nav";
import { SessionFrame } from "../session-frame";
import styles from "../shell.module.css";
// The band's title is in their display face (page-header.tsx).
import "../brand-fonts.css";

// The office: the header, the menu and one screen. Every page is dynamic, so the identity
// mode and the keys are read per request (session-frame.tsx).
export const dynamic = "force-dynamic";

// The skip link is the page's first stop: the header and the six menu links are passed in
// one press, to the screen itself.
export default async function OfficeLayout({ children }: { children: ReactNode }) {
  const { t } = await requestStrings();
  return (
    <SessionFrame>
      <a className={styles.skip} href={`#${MAIN_ID}`}>
        {t.skipToContent}
      </a>
      <Header />
      <div className={styles.shell}>
        <Nav />
        <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
      <KeyboardRows />
    </SessionFrame>
  );
}
