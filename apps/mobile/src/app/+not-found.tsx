// A link to a screen this app does not have (an old notification, a mistyped address):
// said, with the way back to Today, and the address for support.
import { usePathname, useRouter } from "expo-router";

import { useStrings } from "../i18n";
import { Fallback } from "../ui/fallback";

export default function NotFound() {
  const { t } = useStrings();
  const router = useRouter();
  const path = usePathname();
  return (
    <Fallback
      testID="not-found"
      code={t.fallback.notFoundCode}
      title={t.fallback.notFoundTitle}
      body={t.fallback.notFoundBody}
      action={{ label: t.fallback.goToToday, onPress: () => router.replace("/") }}
      reference={`${t.fallback.reference}: ${path}`}
    />
  );
}
