import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { LanguageProvider } from "./i18n";
import { requestLanguage } from "./i18n/server";
import "./theme.css";

// Inter, from the repository itself (fonts/, with its license): the content security policy
// admits no font host, so nothing is fetched from one. One variable file, every weight.
// Not preloaded: at 352 KB, with every script Inter draws, it was asked for on every page,
// the homepage among them, where it was most of what stood before the first photo on a
// slow connection (Lighthouse on staging, 2026-11-23: mobile 86, and 98 with this one
// request blocked). A page that sets text in it fetches it when its stylesheet asks; the
// homepage sets its text in the Latin cut instead ((public)/page.tsx). The owner's choice.
// This build lists every preloadable font under every page, so a preload is all or none.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "TRADER",
  description: "Time tracking, scheduling and invoicing for painting contractors",
};

// The document and the type, and nothing else. Three layouts sit beneath it, one per route
// group: `(public)`, the pages anyone may read, with no menu and nothing of Clerk loaded;
// `(auth)`, sign-in on D'Sierra's brand, beside their navy; `(office)`, the header and the menu.
// A route group's name is not part of an address.
//
// The language is chosen here, on the server, from the person's cookie or their browser
// (i18n/language.ts): the first paint is already in it, and `lang` says which it is.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await requestLanguage();
  return (
    <html lang={language} className={inter.variable}>
      <body>
        <LanguageProvider language={language}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
