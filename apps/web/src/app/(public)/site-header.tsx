import { getImageProps } from "next/image";

import mark from "../../../../../assets/brand/icon.png";
import { LanguageSwitch } from "../language-switch";
import styles from "./home.module.css";

// The homepage's header, pinned to the top: D'Sierra's roller and brush on a white tile
// (the mark is drawn on white and has no transparent version), their name, then the other
// language and the way in for the team. On a laptop it also carries the WhatsApp chat; on
// a phone that is the bar at the bottom of the screen (page.tsx). Navy, so nothing on it is
// red: red on this navy is 2.63:1.
export function SiteHeader({
  name,
  signIn,
  signInHref,
  chat,
}: {
  name: string;
  signIn: string;
  signInHref: string;
  // The number as a link and as it reads, or null where D'Sierra has given none.
  chat: { href: string; label: string } | null;
}) {
  const { props } = getImageProps({ src: mark, alt: "", width: 36, height: 36 });
  const { style: _inline, ...img } = props;
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brand} href="/" aria-label={name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image's props, minus the inline style */}
          <img {...img} alt="" className={styles.mark} />
          <span className={styles.brandName} aria-hidden="true">
            {name}
          </span>
        </a>
        {chat !== null && (
          <a
            className={styles.headCall}
            href={chat.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {chat.label}
          </a>
        )}
        <LanguageSwitch className={styles.headLink} />
        <a className={styles.signIn} href={signInHref}>
          {signIn}
        </a>
      </div>
    </header>
  );
}
