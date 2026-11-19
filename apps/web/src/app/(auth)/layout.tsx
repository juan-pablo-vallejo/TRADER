import Image from "next/image";
import type { ReactNode } from "react";

import logo from "../../../../../assets/brand/logo.png";
import { SessionFrame } from "../session-frame";
import styles from "../shell.module.css";

// Sign-in alone on its page, under the logo: no header, no menu, nothing to go to before
// a person is someone.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <SessionFrame>
      <main className={styles.alone}>
        <Image src={logo} alt="D Sierra Painting" className={styles.logo} priority />
        {children}
      </main>
    </SessionFrame>
  );
}
