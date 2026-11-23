import { headers } from "next/headers";

import { appLinks, deviceOf } from "../../../server/app-links";
import controls from "../../controls.module.css";
import { requestStrings } from "../../i18n/server";
import { LanguageSwitch } from "../../language-switch";
import { Logo } from "../../logo";
import styles from "../../shell.module.css";

// `/get`: where an invitation's message points. In the phone's language, one button for
// this phone: the TestFlight link on an iPhone, the Play testing link on Android, and both
// on anything else. The two links are public variables (server/app-links.ts); with one
// unset the page says to ask the office instead of drawing a button that goes nowhere.
// A public page: nothing of Clerk, and nothing loaded from another host.
export const dynamic = "force-dynamic";

export default async function GetTheApp() {
  const { t } = await requestStrings();
  const device = deviceOf((await headers()).get("user-agent"));
  const links = appLinks(process.env);
  const shown = (["ios", "android"] as const).filter(
    (kind) => device === "other" || device === kind,
  );
  return (
    <main className={styles.column}>
      <div className={styles.home}>
        <Logo />
        <h1 className="title">{t.get.title}</h1>
        <p className={`body ${styles.about}`}>{t.get.explain}</p>
        <div className={styles.ways}>
          {shown.map((kind) => {
            const href = links[kind];
            const label = kind === "ios" ? t.get.iphone : t.get.android;
            return href === null ? (
              <p key={kind} className="body" data-missing={kind}>
                <strong>{label}.</strong> {t.get.askOffice}
              </p>
            ) : (
              <a key={kind} className={controls.primary} href={href} rel="noreferrer">
                {label}
              </a>
            );
          })}
        </div>
        {shown.includes("android") && (
          <p className={`secondary ${styles.about}`}>{t.get.androidNote}</p>
        )}
        <p className={`secondary ${styles.about}`}>{t.get.thenSignIn}</p>
        <a href="/">{t.get.home}</a>
        <LanguageSwitch />
      </div>
    </main>
  );
}
