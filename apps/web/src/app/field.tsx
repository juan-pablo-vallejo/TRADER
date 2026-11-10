// The form field (DESIGN, UI components): the `label` above, the control, then a caption or a
// result note beneath. The control is the child, so an input, a select and a textarea share one
// wrapper and one label rule. Consumed by the roster, customers, jobs, crews and profile
// screens.
import type { ReactNode } from "react";

import controls from "./controls.module.css";

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
  return (
    <div className={`${controls.field} ${className}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
