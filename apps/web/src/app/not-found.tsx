"use client";

// An address with no page. Inside the office ((office)/not-found.tsx) its header and menu
// stay; here, outside it, the way on is the office's first screen or the homepage.
import { useStrings } from "./i18n";
import { StatusScreen } from "./status-screen";

export default function NotFound() {
  const { t } = useStrings();
  return (
    <StatusScreen
      code={t.fallback.notFoundCode}
      title={t.fallback.notFoundTitle}
      body={t.fallback.notFoundBody}
      actions={[
        { label: t.fallback.goToToday, href: "/today", primary: true },
        { label: t.fallback.goHome, href: "/" },
      ]}
    />
  );
}
