import { getImageProps } from "next/image";
import { preload } from "react-dom";

import mark from "../../../../../assets/brand/icon.png";
import { homeHref } from "../../server/sign-in-paths";
import "../brand-fonts.css";
import { LanguageSwitch } from "../language-switch";
import { HOME } from "./home-content";
import styles from "./public-band.module.css";

// The band over Get the app, the privacy policy and the terms: D'Sierra's navy, as the
// office's screens and sign-in open. Their mark and name lead back to the homepage, the
// other language sits at the right, and the page's title stands on the navy in Bodoni.
// A plain <img> with next/image's props minus its inline style: a public page's policy
// admits none (shell.test.ts).

// The headline's font, asked for ahead of the stylesheet, as sign-in and the homepage do.
const HEADING_FONT = "/fonts/BodoniModa-latin-5.3.0.woff2";

export function PublicBand({ title }: { title: string }) {
  preload(HEADING_FONT, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const { style: _inline, ...markImg } = getImageProps({
    src: mark,
    alt: "",
    width: 36,
    height: 36,
  }).props;
  return (
    <header className={styles.band} data-brand>
      <div className={styles.row}>
        <a className={styles.brand} href={homeHref(process.env)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image's props, minus the inline style */}
          <img {...markImg} alt="" className={styles.mark} />
          {HOME.name}
        </a>
        <LanguageSwitch className={styles.language} />
      </div>
      <h1 className={styles.title}>{title}</h1>
    </header>
  );
}
