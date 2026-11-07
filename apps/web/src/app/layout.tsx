import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Header } from "./header";
import { Nav } from "./nav";
import { Providers } from "./providers";
import styles from "./shell.module.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "TRADER",
  description: "Daily closeout and job costing for painting contractors",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <div className={styles.shell}>
            <Nav />
            <main className={styles.main}>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
