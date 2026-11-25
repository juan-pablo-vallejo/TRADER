// The page header: the screen title and at most one primary action on
// one row. The action opens the screen's create form beneath the header; while the form is
// open the button is the secondary "Close", so the form's own submit is the one primary.
import controls from "./controls.module.css";
import { useStrings } from "./i18n";

// The create form's id, named by the action's `aria-controls`; one form per screen.
export const CREATE_FORM_ID = "create-form";

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; open: boolean; onToggle: () => void };
}) {
  const { t } = useStrings();
  return (
    <div className={controls.pageHeader}>
      <h1 className="title">{title}</h1>
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
  );
}
