import { PRIVACY } from "../legal-content";
import { LegalPage } from "../legal-page";

// `/privacy`: what TRADER records, why, and who else handles it. A public page: nothing of
// Clerk, and nothing loaded from another host. The words are legal-content.ts.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <LegalPage
      document={PRIVACY}
      other={{ href: "/terms", label: (t) => t.legal.terms }}
    />
  );
}
