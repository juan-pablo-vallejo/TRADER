import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Header } from "./header";
import "./theme.css";

export const metadata: Metadata = {
  title: "TRADER",
  description: "Daily closeout and job costing for painting contractors",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
