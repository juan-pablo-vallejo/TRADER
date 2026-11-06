import Image from "next/image";

import logo from "../../../../assets/brand/logo.png";
import styles from "./header.module.css";
import { strings } from "./strings";

// DESIGN, Brand: logo.png is the mark for the office header, rendered no smaller than 96 pt
// so the name stays legible, with the wordmark in `title` beside it. The asset is imported
// from its one home in assets/brand, never copied.
export function Header() {
  return (
    <header className={styles.header}>
      <Image src={logo} alt={strings.markAlt} width={96} height={96} priority />
      <span className={`title ${styles.wordmark}`}>{strings.wordmark}</span>
    </header>
  );
}
