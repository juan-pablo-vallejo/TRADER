"use client";

// A wrong address inside the office, under its own header and menu: back where the person
// was, or to Today.
import { useStrings } from "../i18n";
import { StatusScreen } from "../status-screen";

export default function OfficeNotFound() {
  const { t } = useStrings();
  return (
    <StatusScreen
      code={t.fallback.notFoundCode}
      title={t.fallback.notFoundTitle}
      body={t.fallback.notFoundBody}
      actions={[
        { label: t.fallback.goToToday, href: "/today", primary: true },
        { label: t.fallback.goBack, onClick: () => window.history.back() },
      ]}
    />
  );
}
