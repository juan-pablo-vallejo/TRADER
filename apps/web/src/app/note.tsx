// The result note: one `secondary` line beneath the control that caused
// it, announced to a screen reader. "Saved." reads in `synced`, "No change." in
// `ink-secondary`, an informational line in `ink`; anything else is a refusal or a failure, in
// `attention` and announced at once. Consumed by every office screen.
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
  // The status region is on the page before its words: a region inserted already holding
  // them may not be announced. A refusal or a failure is an alert, said at once.
  return (
    <div role="status">
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
