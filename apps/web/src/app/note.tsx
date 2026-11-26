// The result note: one `secondary` line beneath the control that caused
// it, announced to a screen reader. "Saved." reads in `synced`, "No change." in
// `ink-secondary`, an informational line in `ink`; anything else is a refusal or a failure, in
// `attention` and announced at once.
import { useEffect, useRef } from "react";
import controls from "./controls.module.css";
import { useStrings } from "./i18n";

type Tone = "saved" | "neutral" | "info" | "error";

export function Note({ text, tone }: { text: string | null; tone?: Tone }) {
  const { t } = useStrings();
  const shown: Tone | null =
    text === null
      ? null
      : (tone ??
        (text === t.saved ? "saved" : text === t.unchanged ? "neutral" : "error"));
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
      {text !== null && shown !== null && (
        <p
          className={`secondary ${controls.note} ${shown === "info" ? "" : controls[shown]}`}
          role={shown === "error" ? "alert" : undefined}
        >
          {text}
        </p>
      )}
    </div>
  );
}
