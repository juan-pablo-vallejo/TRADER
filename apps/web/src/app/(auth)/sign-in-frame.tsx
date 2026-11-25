import { getImageProps } from "next/image";
import type { ReactNode } from "react";
import { preload } from "react-dom";

import mark from "../../../../../assets/brand/icon.png";
import { homeHref } from "../../server/sign-in-paths";
import { HOME, SIGN_IN_PHOTO } from "../(public)/home-content";
import "../brand-fonts.css";
import { requestStrings } from "../i18n/server";
import { LanguageSwitch } from "../language-switch";
import styles from "./auth.module.css";

// The page sign-in is drawn in, the homepage's next page: D'Sierra's navy beside the form on white. At a
// phone's width the navy is a header (their mark and name, the other language) over the
// form; from 900 px it is a panel with one of their photos and the homepage's headline.
// No menu: there is nothing to go to before a person is someone. The way back to the
// homepage, the other language and Trouble signing in? are here, around the form, so they
// are on every one of its steps.
//
// Nothing here is written inline: a server with no Clerk keys serves this page under the
// policy that admits no inline style at all (server/csp.ts), so the two pictures are
// next/image's props on a plain <img>, without the style attribute its component writes.
//
// A component of the page and not the layout: the layout also wraps the not-found screen
// that /sign-in answers under the development identity, and a page that does not exist
// must not wear sign-in's frame.

// The headline's font, asked for ahead of the stylesheet, as the homepage does
// ((public)/page.tsx says why it is not next/font's).
const HEADING_FONT = "/fonts/BodoniModa-latin-5.3.0.woff2";

export async function SignInFrame({ children }: { children: ReactNode }) {
  const { t, language } = await requestStrings();
  const home = homeHref(process.env);
  preload(HEADING_FONT, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const { style: _markStyle, ...markImg } = getImageProps({
    src: mark,
    alt: "",
    width: 36,
    height: 36,
  }).props;
  // Drawn only from 900 px, where the panel is: lazy, so a phone never asks for it.
  const { style: _photoStyle, ...photoImg } = getImageProps({
    src: SIGN_IN_PHOTO.image,
    alt: SIGN_IN_PHOTO.alt[language],
    sizes: "440px",
  }).props;
  return (
    <div className={styles.page} data-brand>
      <header className={styles.panel}>
        <a className={styles.brand} href={home}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image's props, minus the inline style */}
          <img {...markImg} alt="" className={styles.mark} />
          {HOME.name}
        </a>
        <div className={styles.picture}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image's props, minus the inline style */}
          <img {...photoImg} alt={photoImg.alt} />
        </div>
        <p className={styles.line}>{HOME.headline[language]}</p>
        <a className={styles.home} href={home}>
          {t.get.home}
        </a>
        <span className={styles.narrow}>
          <LanguageSwitch className={styles.language} />
        </span>
      </header>
      <div className={styles.side}>
        <div className={styles.wide}>
          <LanguageSwitch className={styles.language} />
        </div>
        <main className={styles.form}>
          {children}
          <details className={styles.trouble}>
            <summary>{t.signInForm.trouble}</summary>
            <p>{t.signInForm.troubleNoCode}</p>
            <p>{t.signInForm.troubleNewDevice}</p>
            <p>{t.signInForm.troubleNeverInvited}</p>
          </details>
          <a className={styles.back} href={home}>
            {t.get.home}
          </a>
        </main>
      </div>
    </div>
  );
}
