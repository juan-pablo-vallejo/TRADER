import { TERMS } from "../legal-content";
import { LegalPage } from "../legal-page";

// `/terms`: the terms of use. A public page, like `/privacy`; the words are
// legal-content.ts.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <LegalPage
      document={TERMS}
      other={{ href: "/privacy", label: (t) => t.legal.privacy }}
    />
  );
}
