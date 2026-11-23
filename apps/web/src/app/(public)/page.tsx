import { getImageProps } from "next/image";

import { signInPath } from "../../server/identity-mode";
import controls from "../controls.module.css";
import type { Language } from "../i18n/language";
import { requestStrings } from "../i18n/server";
import { LanguageSwitch } from "../language-switch";
import { Logo } from "../logo";
import styles from "../shell.module.css";
import { HOME, type Photo } from "./home-content";

// `/`: D'Sierra Painting's homepage, one page in English and Spanish. Their logo, what
// they do and where, Call and Email as plain links, their photos, then Team sign-in and
// Get the app, both on this same host. Its words and pictures are home-content.ts, and a
// part with no content draws nothing. Whose `/` this is, on a deployment with more than
// one host, is the proxy's to say (server/addresses.ts). It shares its address with the
// office, so it loads nothing from another host: no font, no map, no script.
export const dynamic = "force-dynamic";

// A number as a `tel:` link dials it: the digits, and a leading plus.
const dialable = (phone: string) => phone.replace(/[^\d+]/g, "");

// As logo.tsx: next/image's resizing, a plain <img>, no inline style.
function Picture({
  photo,
  language,
  id,
}: {
  photo: Photo;
  language: Language;
  id?: string;
}) {
  const { props } = getImageProps({
    src: photo.image,
    alt: photo.alt[language],
    sizes: "(min-width: 768px) 340px, 100vw",
  });
  const { style: _inline, ...img } = props;
  // eslint-disable-next-line @next/next/no-img-element -- next/image's props, minus the inline style
  return <img {...img} alt={img.alt} id={id} />;
}

export default async function Home() {
  const { t, language } = await requestStrings();
  return (
    <div className={styles.home}>
      <Logo />
      <h1 className="title">{HOME.name}</h1>
      {HOME.about !== null && (
        <p className={`body ${styles.about}`}>{HOME.about[language]}</p>
      )}
      {HOME.where !== null && <p className={styles.where}>{HOME.where}</p>}
      {(HOME.phone !== null || HOME.email !== null) && (
        <p className={styles.contact}>
          {HOME.phone !== null && (
            <a href={`tel:${dialable(HOME.phone)}`}>{t.call(HOME.phone)}</a>
          )}
          {HOME.email !== null && (
            <a href={`mailto:${HOME.email}`}>{t.emailUs(HOME.email)}</a>
          )}
        </p>
      )}
      {HOME.photos.length > 0 && (
        <section className={styles.photos} aria-label={t.photos}>
          {HOME.photos.map((photo, index) =>
            photo.finished === undefined ? (
              <Picture key={photo.image.src} photo={photo} language={language} />
            ) : (
              // Work under way, and the same job finished beside it: one strip that a
              // swipe, a sideways scroll or the arrow keys move along. No script: the
              // strip snaps by CSS and takes the focus so the keys reach it, and its
              // line is a link to the finished photo, which a mouse can press.
              <figure key={photo.image.src} className={styles.reveal}>
                <div
                  className={styles.strip}
                  role="group"
                  aria-label={t.swipeFinished}
                  tabIndex={0}
                >
                  <Picture photo={photo} language={language} />
                  <Picture
                    photo={photo.finished}
                    language={language}
                    id={`finished-${index}`}
                  />
                </div>
                <figcaption>
                  <a href={`#finished-${index}`}>{t.swipeFinished}</a>
                </figcaption>
              </figure>
            ),
          )}
        </section>
      )}
      <div className={styles.ways}>
        <a className={controls.primary} href={signInPath(process.env)}>
          {t.teamSignIn}
        </a>
        <a className={controls.secondary} href="/get">
          {t.getApp}
        </a>
      </div>
      <p className={styles.legalLinks}>
        <a href="/privacy">{t.legal.privacy}</a>
        <a href="/terms">{t.legal.terms}</a>
        <LanguageSwitch />
      </p>
    </div>
  );
}
