// The result note: one `secondary` line beneath the control that caused
// it, announced to a screen reader. "Saved." reads in `synced`, "No change." in
// `ink-secondary`, an informational line in `ink`; anything else is a refusal or a failure, in
// `attention` and announced at once. Consumed by every office screen.
import controls from "./controls.module.css";
import { useStrings } from "./i18n";

type Tone = "saved" | "neutral" | "info" | "error";

export function Note({ text, tone }: { text: string | null; tone?: Tone }) {
  const { t } = useStrings();
  if (text === null) return null;
  const shown: Tone =
    tone ?? (text === t.saved ? "saved" : text === t.unchanged ? "neutral" : "error");
  return (
    <p
      className={`secondary ${controls.note} ${shown === "info" ? "" : controls[shown]}`}
      role={shown === "error" ? "alert" : "status"}
    >
      {text}
    </p>
  );
}
