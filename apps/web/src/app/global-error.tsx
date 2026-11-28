"use client";

// The last fallback: the document's own layout threw, so nothing of it is here, not the
// language or the fonts. Both languages, the office's theme (imported here, since the
// layout's is not), one action, and the error's digest (the id the server's log carries)
// for support.
import controls from "./controls.module.css";
import styles from "./global-error.module.css";
import "./theme.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className={styles.body}>
        <title>Something went wrong · TRADER</title>
        <main className={styles.main}>
          <h1>Something went wrong.</h1>
          <p>Nothing was saved by the step that failed. Try again to carry on.</p>
          <p lang="es">
            Algo salió mal. El paso que falló no guardó nada. Inténtalo de nuevo para
            seguir.
          </p>
          <button type="button" className={controls.primary} onClick={reset}>
            Try again · Intentar de nuevo
          </button>
          {error.digest !== undefined && (
            <p className={styles.reference}>
              Reference · Referencia: <code>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
