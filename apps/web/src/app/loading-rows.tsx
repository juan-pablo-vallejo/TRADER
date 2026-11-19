// A first load: placeholder rows where the list will be, so the screen keeps its shape and
// nothing jumps when the rows arrive. Only ever a first load: a screen visited before opens
// on what it last showed (providers.tsx). The bars are decoration; a screen reader hears
// one word. They do not pulse: nothing here moves but a change of state.
import styles from "./controls.module.css";
import { strings } from "./strings";

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.loadingRows} role="status" aria-label={strings.loadingRows}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.loadingRow} aria-hidden="true">
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
