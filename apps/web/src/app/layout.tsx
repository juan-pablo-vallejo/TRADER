import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { LanguageProvider } from "./i18n";
import { requestLanguage } from "./i18n/server";
import "./theme.css";

// Inter, from the repository itself (fonts/, with its license): the content security policy
// admits no font host, so nothing is fetched from one. One variable file, every weight.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TRADER",
  description: "Time tracking, scheduling and invoicing for painting contractors",
};

// The document and the type, and nothing else. Three layouts sit beneath it, one per route
// group: `(public)`, the pages anyone may read, with no menu and nothing of Clerk loaded;
// `(auth)`, sign-in alone on its page under the logo; `(office)`, the header and the menu.
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
