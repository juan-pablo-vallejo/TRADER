import type { ReactNode } from "react";

import styles from "../shell.module.css";

// The public pages: `/`, and `/get`, `/privacy` and `/terms` as they are written. No menu,
// no query client, and nothing of Clerk: a visitor's browser loads this app's own files
// and no other host's. Each page brings its own `<main>`: the homepage has a header and a
// footer around its own, and the other three are one column (shell.module.css).
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className={styles.public}>{children}</div>;
}
