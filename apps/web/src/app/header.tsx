import Image from "next/image";

import { devIdentityEnabled } from "@trader/api";

import icon from "../../../../assets/brand/icon.png";
import { Account } from "./account";
import styles from "./header.module.css";
import { strings } from "./strings";

// DESIGN, Layout and Brand: the office header is 56 pt — icon.png at 32 pt, the wordmark, and
// the signed-in person on the right. The asset is imported from its one home in assets/brand,
// never copied. Sign-out exists only where the development identity is on, read per request.
export function Header() {
  return (
    <header className={styles.header}>
      <Image src={icon} alt="" width={32} height={32} priority />
      <span className={`heading ${styles.wordmark}`}>{strings.wordmark}</span>
      <Account devSignIn={devIdentityEnabled(process.env)} />
    </header>
  );
}
