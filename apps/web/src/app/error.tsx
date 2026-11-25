"use client";

// The route's error boundary: what a screen shows when rendering it throws. The office
// places it inside its own layout ((office)/error.tsx), so the header and menu stay. `reset`
// renders the route again; a write that failed answered through its own result note.
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
