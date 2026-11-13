import Image from "next/image";

import icon from "../../../../assets/brand/icon.png";
import { signInPath } from "../server/identity-mode";
import { Account } from "./account";
import styles from "./header.module.css";
import { strings } from "./strings";

// DESIGN, Layout and Brand: the office header is 56 pt — icon.png at 32 pt, the wordmark, and
// the signed-in person on the right. The asset is imported from its one home in assets/brand,
// never copied. Which sign-in the person is sent to is this server's identity mode, read per
// request (server/identity-mode.ts).
export function Header() {
  return (
    <header className={styles.header}>
      <Image src={icon} alt="" width={32} height={32} priority />
      <span className={`heading ${styles.wordmark}`}>{strings.wordmark}</span>
      <Account signInHref={signInPath(process.env)} />
    </header>
  );
}
