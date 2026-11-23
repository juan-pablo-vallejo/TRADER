import { getImageProps } from "next/image";

import logo from "../../../../assets/brand/logo.png";
import styles from "./shell.module.css";

// D Sierra's logo, on `/get`. Drawn through next/image's own resizing (160 px wide, twice
// that for a dense screen, never the 2048 px original), but as a plain <img>: the component writes an inline
// style on its element, and the public pages' content security policy admits none (seen
// refused on staging, 2026-11-19). The asset is imported from its one home in assets/brand.
export function Logo() {
  const { props } = getImageProps({
    src: logo,
    alt: "D'Sierra Painting",
    width: 160,
    height: 160,
    priority: true,
  });
  const { style: _inline, ...img } = props;
  // eslint-disable-next-line @next/next/no-img-element -- next/image's props, minus the inline style
  return <img {...img} alt={img.alt} className={styles.logo} />;
}
