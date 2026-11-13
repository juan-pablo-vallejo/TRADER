// The empty state (DESIGN, UI components): one sentence and at most one action. Its own
// file so failure.tsx and clerk-session.tsx can both draw it without importing each other.
import controls from "./controls.module.css";

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className={controls.empty}>
      <p className="body">{text}</p>
      {action}
    </div>
  );
}
