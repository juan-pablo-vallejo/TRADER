import { devIdentityEnabled } from "@trader/api";

import styles from "./page.module.css";
import { strings } from "./strings";

// The shell's home: an empty state (DESIGN, UI components) until the first office screen.
// Read per request, never at build: the one action it offers exists only where the
// development identity is on.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className={styles.main}>
      <p className="body">{strings.empty}</p>
      {devIdentityEnabled(process.env) && <a href="/dev-signin">{strings.devSignIn}</a>}
    </main>
  );
}
