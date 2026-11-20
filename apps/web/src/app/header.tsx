import Image from "next/image";

import icon from "../../../../assets/brand/icon.png";
import { signInPath } from "../server/identity-mode";
import { Account } from "./account";
import { CommandMenu } from "./command-menu";
import { CompanyName } from "./company-name";
import styles from "./header.module.css";

// The office header is 56 px: D Sierra's mark at 32 px, the company's name as Settings
// holds it (company-name.tsx), the command menu's button, and the signed-in person on the
// right. The asset is imported
// from its one home in assets/brand, never copied. Which sign-in the person is sent to is
// this server's identity mode, read per request (server/identity-mode.ts).
export function Header() {
  return (
    <header className={styles.header}>
      <Image src={icon} alt="" width={32} height={32} priority />
      <CompanyName className={`heading ${styles.wordmark}`} />
      <CommandMenu />
      <Account signInHref={signInPath(process.env)} />
    </header>
  );
}
