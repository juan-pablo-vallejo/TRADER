import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import { preload } from "react-dom";

import { whatsAppLink } from "@trader/api/contract";

import { signInPath } from "../../server/identity-mode";
import { WhatsAppMark } from "../whatsapp-mark";
import "../brand-fonts.css";
import type { Language } from "../i18n/language";
import { requestStrings } from "../i18n/server";
import { LanguageSwitch } from "../language-switch";
import { Gallery } from "./gallery";
import { HOME, type Photo } from "./home-content";
import styles from "./home.module.css";
import { SiteHeader } from "./site-header";

// `/`: D'Sierra Painting's homepage, one page in English and Spanish, and the first thing
// a customer of theirs sees. A header that stays, a photo of their work, what they do and
// where, four facts a customer checks, jobs before and after, a gallery, what they do as
// a list, then WhatsApp and Email, the only two things a customer can do here. The team's way
// in is the header's; Get the app, the policy and the terms are the footer's. Its words
// and pictures are home-content.ts, and a part with no content draws nothing. Whose `/`
// this is, on a deployment with more than one host, is the proxy's to say
// (server/addresses.ts). It shares its address with the office, so it loads nothing from
// another host: no font, no map, no script, no embed. Its links to D'Sierra's own pages
// elsewhere are plain links.
export const dynamic = "force-dynamic";

// The page's two fonts, from the app itself (public/fonts, their licenses in app/fonts):
// Bodoni Moda for headings, the serif nearest D'Sierra's own wordmark, and the Latin cut
// of Inter for text, 48 KB for English and Spanish against the 352 KB file the office
// reads (layout.tsx). Each from its @fontsource-variable package at the version in its
// name, and declared in app/brand-fonts.css, which sign-in imports too.
// Not next/font: this build lists every preloadable font under every page, so a font
// declared here is preloaded in every route's `Link` headers, the office's among them; and
// with no preload the Spanish headline draws in three lines, then five when the serif
// arrives. At a fixed address the page asks for the
// headline's font itself, ahead of its stylesheet, and no page but this one and sign-in,
// which does the same, hears of either.
const HEADING_FONT = "/fonts/BodoniModa-latin-5.3.0.woff2";

// The address a shared link's picture is fetched from: this request's own host. Null for
// a host header that is not one.
function originOf(host: string | null): URL | null {
  if (host === null || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  return new URL(`${local ? "http" : "https"}://${host}`);
}

// The tab, a search result and a link sent in a message name D'Sierra, not TRADER.
export async function generateMetadata(): Promise<Metadata> {
  const { language } = await requestStrings();
  const title = `${HOME.name}: ${HOME.headline[language]}`;
  const description = [HOME.summary[language], HOME.place?.[language]]
    .filter((part) => part !== undefined)
    .join(" ");
  const origin = originOf((await headers()).get("host"));
  return {
    title,
    description,
    ...(origin !== null && { metadataBase: origin }),
    openGraph: {
      type: "website",
      title,
      description,
      locale: language === "es" ? "es_US" : "en_US",
      ...(origin !== null && {
        images: [
          {
            url: HOME.hero.image.src,
            width: HOME.hero.image.width,
            height: HOME.hero.image.height,
            alt: HOME.hero.alt[language],
          },
        ],
      }),
    },
  };
}

// The browser's own bar takes the header's navy: --brand-navy (theme.css), which a test
// holds this to.
export const viewport: Viewport = { themeColor: "#140064" };

// One of their photos: resized and re-encoded by next/image for the screen that asks, a
// blurred stand-in until it arrives, and lazy unless it is the page's first: that one is
// asked for at once and ahead of everything else, as the installed Next's docs say to
// (`loading` and `fetchPriority`, in place of `preload`; `priority` is retired). With
// `preload` alone the request carries no priority.
function Shot({
  photo,
  language,
  sizes,
  first = false,
}: {
  photo: Photo;
  language: Language;
  sizes: string;
  first?: boolean;
}) {
  return (
    <Image
      src={photo.image}
      alt={photo.alt[language]}
      placeholder="blur"
      sizes={sizes}
      {...(first && { loading: "eager" as const, fetchPriority: "high" as const })}
    />
  );
}

export default async function Home() {
  const { t, language } = await requestStrings();
  // A customer writes to D'Sierra on WhatsApp: a chat with their number, no call.
  const chat = whatsAppLink(HOME.phone);
  const mail = HOME.email === null ? null : `mailto:${HOME.email}`;
  const place = HOME.place?.[language];
  preload(HEADING_FONT, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <div className={styles.page} data-brand>
      <SiteHeader
        name={HOME.name}
        signIn={t.teamSignIn}
        signInHref={signInPath(process.env)}
        chat={chat === null ? null : { href: chat, label: t.whatsAppChat }}
      />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroPhoto}>
            <Shot
              photo={HOME.hero}
              language={language}
              sizes="(min-width: 900px) 54vw, 100vw"
              first
            />
          </div>
          <div className={styles.heroText}>
            <h1 className={styles.h1}>
              {HOME.headline[language].split(" ").map((word, index) => (
                // Each word whole: "multi-unit" is not cut at its hyphen.
                <span key={index}>
                  {index > 0 && " "}
                  <span className={styles.word}>{word}</span>
                </span>
              ))}
            </h1>
            <p className={styles.lede}>{HOME.summary[language]}</p>
            {place !== undefined && <p className={styles.place}>{place}</p>}
            {(chat !== null || mail !== null) && (
              <p className={styles.heroActions}>
                {chat !== null && (
                  <a
                    className={styles.call}
                    href={chat}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsAppMark label={t.whatsAppChat} height={24} />
                  </a>
                )}
                {mail !== null && HOME.email !== null && (
                  <a className={styles.email} href={mail}>
                    {t.emailUs(HOME.email)}
                  </a>
                )}
              </p>
            )}
          </div>
        </section>

        {HOME.facts.length > 0 && (
          // Four paint chips, as a color card shows them: the color above, its name below.
          <ul className={styles.facts}>
            {HOME.facts.map((fact) => (
              <li key={fact.figure.en} className={styles.chip}>
                <strong className={styles.figure}>{fact.figure[language]}</strong>
                <span className={styles.factLabel}>{fact.label[language]}</span>
              </li>
            ))}
          </ul>
        )}

        {HOME.pairs.length > 0 && (
          <section className={styles.section} aria-labelledby="before-after">
            <h2 id="before-after" className={styles.h2}>
              {t.home.beforeAfter}
            </h2>
            <div className={styles.pairs}>
              {HOME.pairs.map((pair, index) => (
                // One job twice. On a phone, one strip that a swipe, a sideways scroll or
                // the arrow keys move along: no script, the strip snaps by CSS and takes
                // the focus so the keys reach it, and its line is a link to the finished
                // half, which a mouse can press. On a laptop the two sit side by side.
                <figure key={pair.before.image.src} className={styles.pair}>
                  <div
                    className={styles.strip}
                    role="group"
                    aria-label={pair.job[language]}
                    tabIndex={0}
                  >
                    <div className={styles.half}>
                      <Shot
                        photo={pair.before}
                        language={language}
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                      <span className={styles.tagBefore}>{t.home.before}</span>
                    </div>
                    <div className={styles.half} id={`finished-${index}`}>
                      <Shot
                        photo={pair.after}
                        language={language}
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                      <span className={styles.tagAfter}>{t.home.after}</span>
                    </div>
                  </div>
                  <figcaption className={styles.pairCaption}>
                    <span>{pair.job[language]}</span>
                    <a className={styles.swipe} href={`#finished-${index}`}>
                      {t.swipeFinished}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {HOME.gallery.length > 0 && (
          <section className={styles.section} aria-labelledby="our-work">
            <h2 id="our-work" className={styles.h2}>
              {t.photos}
            </h2>
            <Gallery
              photos={HOME.gallery.map((photo) => ({
                image: photo.image,
                alt: photo.alt[language],
              }))}
            />
          </section>
        )}

        {HOME.services.length + HOME.projects.length > 0 && (
          <section className={styles.section} aria-labelledby="what-we-do">
            <h2 id="what-we-do" className={styles.h2}>
              {t.home.whatWeDo}
            </h2>
            <div className={styles.lists}>
              {HOME.services.length > 0 && (
                <div>
                  <h3 className={styles.h3}>{t.home.services}</h3>
                  <ul className={styles.list}>
                    {HOME.services.map((service) => (
                      <li key={service.en}>{service[language]}</li>
                    ))}
                  </ul>
                </div>
              )}
              {HOME.projects.length > 0 && (
                <div>
                  <h3 className={styles.h3}>{t.home.projects}</h3>
                  <ul className={styles.list}>
                    {HOME.projects.map((project) => (
                      <li key={project.en}>{project[language]}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {(chat !== null || mail !== null) && (
          <section className={styles.band} aria-labelledby="estimates">
            <div className={styles.bandInner}>
              <h2 id="estimates" className={styles.h2}>
                {HOME.estimates[language]}
              </h2>
              {place !== undefined && <p className={styles.place}>{place}</p>}
              <p className={styles.actions}>
                {chat !== null && (
                  <a
                    className={styles.call}
                    href={chat}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsAppMark label={t.whatsAppChat} height={24} />
                  </a>
                )}
                {mail !== null && HOME.email !== null && (
                  <a className={styles.email} href={mail}>
                    {t.emailUs(HOME.email)}
                  </a>
                )}
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerName}>{HOME.legalName}</p>
          <nav className={styles.footerLinks} aria-label={t.home.team}>
            <a href={signInPath(process.env)}>{t.teamSignIn}</a>
            <a href="/get">{t.getApp}</a>
          </nav>
          {HOME.social.length > 0 && (
            <nav className={styles.footerLinks} aria-label={t.home.elsewhere}>
              {HOME.social.map((site) => (
                <a key={site.href} href={site.href} rel="noopener">
                  {site.name}
                </a>
              ))}
            </nav>
          )}
          <p className={styles.footerLinks}>
            <a href="/privacy">{t.legal.privacy}</a>
            <a href="/terms">{t.legal.terms}</a>
            <LanguageSwitch className={styles.footerSwitch} />
          </p>
        </div>
      </footer>

      {(chat !== null || mail !== null) && (
        // A phone only: WhatsApp one tap away, wherever the page has been scrolled to.
        <nav className={styles.callBar} aria-label={t.home.contact}>
          {chat !== null && (
            <a
              className={styles.call}
              href={chat}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppMark label={t.whatsAppChat} height={24} />
            </a>
          )}
          {mail !== null && (
            <a className={styles.email} href={mail}>
              {t.home.emailShort}
            </a>
          )}
        </nav>
      )}
    </div>
  );
}
