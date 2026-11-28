// The page header: the screen's band, as the phone's, on their navy across the top of the
// screen, its title in their display face and its main fact beside it (Today's count on the
// clock, Hours' total); then, off the navy, the screen's actions. Red never sits on navy,
// so the one primary action is beneath the band, not on it.
//
// `action` is the screen's create form: it opens the form beneath the header, and while
// the form is open the button is the secondary "Close", so the form's own submit is the one
// primary. `actions` is for a screen with more than one (Schedule's Copy last week and Add
// shift). `above` is what leads to the screen and sits on the band over its title: the
// tabs of Jobs and Customers, an invoice's way back to the list.
import type { ReactNode } from "react";

import controls from "./controls.module.css";
import { useStrings } from "./i18n";

// The create form's id, named by the action's `aria-controls`; one form per screen.
export const CREATE_FORM_ID = "create-form";

export function PageHeader({
  title,
  above,
  fact,
  action,
  actions,
}: {
  title: string;
  above?: ReactNode;
  fact?: { label: string; value: string };
  action?: { label: string; open: boolean; onToggle: () => void };
  actions?: ReactNode;
}) {
  const { t } = useStrings();
  return (
    <div className={controls.pageHeader}>
      <div className={controls.band}>
        {above}
        <h1 className={controls.bandTitle}>{title}</h1>
        {fact !== undefined && (
          <p className={controls.fact}>
            <span className={controls.factLabel}>{fact.label}</span>
            <span className={controls.factValue}>{fact.value}</span>
          </p>
        )}
      </div>
      {(action !== undefined || actions !== undefined) && (
        <div className={controls.headerActions}>
          {actions}
          {action !== undefined && (
            <button
              type="button"
              className={action.open ? controls.secondary : controls.primary}
              aria-expanded={action.open}
              aria-controls={CREATE_FORM_ID}
              onClick={() => {
                const opening = !action.open;
                action.onToggle();
                // Opened, the form takes the focus to its first field.
                if (opening)
                  requestAnimationFrame(() =>
                    document
                      .getElementById(CREATE_FORM_ID)
                      ?.querySelector<HTMLElement>("input, select, textarea")
                      ?.focus(),
                  );
              }}
            >
              {action.open ? t.close : action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
