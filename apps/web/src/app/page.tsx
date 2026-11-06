import styles from "./page.module.css";
import { strings } from "./strings";

// The shell's home: an empty state (DESIGN, UI components) until the first office screen.
export default function Home() {
  return (
    <main className={styles.main}>
      <p className="body">{strings.empty}</p>
    </main>
  );
}
