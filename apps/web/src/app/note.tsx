// The result note: one `secondary` line beneath the control that caused
// it, announced to a screen reader. "Saved." reads in `synced`, "No change." in
// `ink-secondary`, an informational line in `ink`; anything else is a refusal or a failure, in
// `attention` and announced at once.
import { useEffect, useRef } from "react";
import controls from "./controls.module.css";
import { useStrings } from "./i18n";
import { en } from "./i18n/en";
import { es } from "./i18n/es";

type Tone = "saved" | "neutral" | "info" | "error";

export function Note({ text, tone }: { text: string | null; tone?: Tone }) {
  const { t } = useStrings();
  // "Saved." or "No change." said before the language changed is said again in the new
  // one, and keeps its tone: never a red "Saved." in English on a Spanish page.
  const said =
    text === en.saved || text === es.saved
      ? t.saved
      : text === en.unchanged || text === es.unchanged
        ? t.unchanged
        : text;
  const shown: Tone | null =
    said === null
      ? null
      : (tone ??
        (said === t.saved ? "saved" : said === t.unchanged ? "neutral" : "error"));
  // Said where it can be seen: a note under a long form's Save may be below the screen
  // when the person pressed Enter in a field near the top.
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (text !== null) region.current?.scrollIntoView({ block: "nearest" });
  }, [text]);
  // The status region is on the page before its words: a region inserted already holding
  // them may not be announced. A refusal or a failure is an alert, said at once.
  return (
    <div role="status" ref={region}>
      {said !== null && shown !== null && (
        <p
          className={`secondary ${controls.note} ${shown === "info" ? "" : controls[shown]}`}
          role={shown === "error" ? "alert" : undefined}
        >
          {said}
        </p>
      )}
    </div>
  );
}
