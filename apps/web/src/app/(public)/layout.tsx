import type { ReactNode } from "react";

import styles from "../shell.module.css";

// The public pages: `/`, and `/get`, `/privacy` and `/terms` as they are written. No menu,
// no query client, and nothing of Clerk: a visitor's browser loads this app's own files
// and no other host's.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <main className={styles.public}>{children}</main>;
}
