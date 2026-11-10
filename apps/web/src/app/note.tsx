// The result note (DESIGN, UI components): one `secondary` line beneath the control that caused
// it, announced to a screen reader. "Saved." reads in `synced`, "No change." in
// `ink-secondary`, an informational line in `ink`; anything else is a refusal or a failure, in
// `attention` and announced at once. Consumed by every office screen.
import controls from "./controls.module.css";
import { strings } from "./strings";

type Tone = "saved" | "neutral" | "info" | "error";

const toneOf = (text: string): Tone =>
  text === strings.saved ? "saved" : text === strings.unchanged ? "neutral" : "error";

export function Note({ text, tone }: { text: string | null; tone?: Tone }) {
  if (text === null) return null;
  const t = tone ?? toneOf(text);
  return (
    <p
      className={`secondary ${controls.note} ${t === "info" ? "" : controls[t]}`}
      role={t === "error" ? "alert" : "status"}
    >
      {text}
    </p>
  );
}
