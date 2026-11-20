"use client";

// The route's error boundary: what a screen shows when rendering it throws. The shell stays
// (layout.tsx is above this boundary), so the navigation still works. `reset` renders the
// route again; a write that failed answered through its own result note, never here.
import controls from "./controls.module.css";
import { useStrings } from "./i18n";

export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useStrings();
  return (
    <div className={controls.banner} role="alert">
      <p className="body-strong">{t.pageError}</p>
      <p className="secondary">{t.pageErrorHelp}</p>
      <button type="button" className={controls.secondary} onClick={reset}>
        {t.reload}
      </button>
    </div>
  );
}
