import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { officeHost } from "../../server/environment";
import { signInPath } from "../../server/identity-mode";
import { OFFICE_HOME } from "../../server/sign-in-paths";
import controls from "../controls.module.css";
import { Logo } from "../logo";
import styles from "../shell.module.css";
import { strings } from "../strings";

// `/`: D Sierra Painting's homepage. Until D Sierra's own words and photos arrive it holds
// what the repository already has, their name and their logo, and the way in for the team:
// nothing on it is invented. Where a deployment answers on a public host and an office
// host (TRADER_OFFICE_HOST), `/` on the office's host goes to the office.
export const dynamic = "force-dynamic";

export default async function Home() {
  const host = (await headers()).get("host");
  if (officeHost(process.env, host)) redirect(OFFICE_HOME);
  return (
    <div className={styles.home}>
      <Logo />
      <a className={controls.primary} href={signInPath(process.env)}>
        {strings.teamSignIn}
      </a>
    </div>
  );
}
