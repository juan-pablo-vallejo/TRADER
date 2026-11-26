"use client";

// The route's error boundary: what a screen shows when rendering it throws. The office
// places it inside its own layout ((office)/error.tsx), so the header and menu stay. `reset`
// renders the route again; a write that failed answered through its own result note. The
// reference is the error's digest, the id the server's log carries, when there is one.
import { useStrings } from "./i18n";
import { StatusScreen } from "./status-screen";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useStrings();
  return (
    <StatusScreen
      code={t.fallback.errorCode}
      title={t.pageError}
      body={t.pageErrorHelp}
      actions={[
        { label: t.fallback.tryAgain, onClick: reset, primary: true },
        { label: t.fallback.goToToday, href: "/today" },
      ]}
      {...(error.digest !== undefined && { reference: error.digest })}
    />
  );
}
