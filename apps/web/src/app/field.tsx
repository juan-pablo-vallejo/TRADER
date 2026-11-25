"use client";

// The form field: the `label` above, the control, then a caption or a
// result note beneath. The control is the child, so an input, a select and a textarea share one
// wrapper and one label rule.
//
// A control the browser refuses as its form is sent (empty and required, an email that is
// not one) is refused here instead: the browser's bubble is held back, the office's own
// sentence stands under the field in the chosen language (refusal.ts), and the first such
// control in the form takes the focus, as the bubble would have given it. A change to the
// control takes the sentence away.
import { useState, type ReactNode, type SyntheticEvent } from "react";

import controls from "./controls.module.css";
import { useStrings } from "./i18n";
import { refusalOf } from "./refusal";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function Field({
  id,
  label,
  className = "",
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useStrings();
  const [refusal, setRefusal] = useState<string | null>(null);
  const refusalId = `${id}-refusal`;
  // The control's own tie to the sentence, set on the element: the control is the child's
  // to draw, and keeps whatever else it describes itself with.
  const tie = (control: Control, on: boolean) => {
    const others = (control.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((token) => token !== "" && token !== refusalId);
    const tokens = on ? [...others, refusalId] : others;
    if (tokens.length === 0) control.removeAttribute("aria-describedby");
    else control.setAttribute("aria-describedby", tokens.join(" "));
    if (on) control.setAttribute("aria-invalid", "true");
    else if (control.getAttribute("aria-invalid") === "true" && control.validity.valid)
      control.removeAttribute("aria-invalid");
  };
  const refuse = (e: SyntheticEvent) => {
    const control = e.target as Control;
    e.preventDefault();
    setRefusal(refusalOf(control.validity, t));
    tie(control, true);
    const first = [...(control.form?.elements ?? [])].find(
      (el) => "validity" in el && !(el as Control).validity.valid,
    );
    if (first === control) control.focus();
  };
  return (
    <div
      className={`${controls.field} ${className}`}
      onInvalid={refuse}
      onChange={(e) => {
        if (refusal === null) return;
        setRefusal(null);
        tie(e.target as Control, false);
      }}
    >
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {refusal !== null && (
        <p id={refusalId} className={`secondary ${controls.error}`} role="alert">
          {refusal}
        </p>
      )}
    </div>
  );
}
