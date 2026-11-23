import { formatters } from "../format";
import { requestStrings } from "../i18n/server";
import { LanguageSwitch } from "../language-switch";
import styles from "../shell.module.css";
import {
  APPROVED,
  LAST_CHANGED,
  OPERATOR,
  PRIVACY_CONTACT,
  type Document,
} from "./legal-content";
import type { Language } from "../i18n/language";

// The privacy policy and the terms are one page drawn twice: a title, the day the words
// last changed, the sections, who operates TRADER and how to reach them, and the way to
// the other document, the homepage and the other language. Until the owner has approved
// the words the page says it is a draft, and names what is still to come.
export async function LegalPage({
  document,
  other,
}: {
  document: Record<Language, Document>;
  other: {
    href: string;
    label: (t: Awaited<ReturnType<typeof requestStrings>>["t"]) => string;
  };
}) {
  const { t, language } = await requestStrings();
  const doc = document[language];
  const f = formatters(language, t);
  return (
    <main className={styles.column}>
      <article className={styles.legal}>
        <h1 className="title">{doc.title}</h1>
        <p className="secondary">{t.legal.lastChanged(f.day(LAST_CHANGED))}</p>
        {!APPROVED && (
          <p className={styles.draft} role="note">
            {t.legal.draft}
          </p>
        )}
        <p className="body">{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="heading">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="body">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <section>
          <h2 className="heading">{t.legal.operator}</h2>
          <p className="body">
            {OPERATOR ?? t.legal.operatorToCome}
            {PRIVACY_CONTACT !== null && (
              <>
                {" · "}
                <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>
              </>
            )}
          </p>
          {PRIVACY_CONTACT === null && <p className="body">{t.legal.contactToCome}</p>}
        </section>
        <p className={styles.legalLinks}>
          <a href={other.href}>{other.label(t)}</a>
          <a href="/">{t.get.home}</a>
          <LanguageSwitch />
        </p>
      </article>
    </main>
  );
}
