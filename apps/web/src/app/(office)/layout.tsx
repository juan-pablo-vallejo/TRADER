import type { ReactNode } from "react";

import { Header } from "../header";
import { KeyboardRows } from "../keyboard-rows";
import { Nav } from "../nav";
import { SessionFrame } from "../session-frame";
import styles from "../shell.module.css";

// The office: the header, the menu and one screen. Every page is dynamic, so the identity
// mode and the keys are read per request (session-frame.tsx).
export const dynamic = "force-dynamic";

export default function OfficeLayout({ children }: { children: ReactNode }) {
  return (
    <SessionFrame>
      <Header />
      <div className={styles.shell}>
        <Nav />
        <main className={styles.main}>{children}</main>
      </div>
      <KeyboardRows />
    </SessionFrame>
  );
}
