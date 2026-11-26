// The phone app's tokens: color, type, layout and spacing. Light theme
// only. Text is never under `secondary`
// (15 pt), a target never under 48 pt, the primary button 56 pt.
// Color: where a name is the office's too (apps/web/src/app/theme.css), the same value; a
// test fails when the two differ (apps/web/test/theme.test.ts). The phone is on D'Sierra's
// own scheme, as their homepage and sign-in are: their red for an action, their navy for
// what is chosen, a link, the active tab and a control's edge. Red never sits on navy
// (2.63:1). The office keeps its indigo; the status tones are the office's.
export const color = {
  ink: "#111827",
  inkSecondary: "#4B5563",
  canvas: "#F5F6F8",
  surface: "#FFFFFF",
  // A hairline between things.
  border: "#D9DCE3",
  // The edge of a control, a field's included: the navy, 3:1 and more on white and canvas.
  controlBorder: "#140064",
  // An action: a primary button, white on their red (6.57:1), darker while pressed.
  primary: "#BC0C0C",
  primaryPressed: "#9A0A0A",
  onPrimary: "#FFFFFF",
  // What is chosen, a link, the active tab: their navy, and its lightest tint behind a
  // chosen row.
  action: "#140064",
  actionPressed: "#0D0041",
  onAction: "#FFFFFF",
  actionTint: "#E3E0EC",
  brand: "#BC0C0C",
  brandNavy: "#140064",
  muted: "#6B7280",
  // Five status tones, each an ink on its tint. Never color alone: an icon and a word too.
  neutralInk: "#374151",
  neutralTint: "#EEF0F3",
  activeInk: "#2808AC",
  activeTint: "#EEEBFA",
  doneInk: "#166534",
  doneTint: "#E3F2E8",
  attentionInk: "#92400E",
  attentionTint: "#FBEFD9",
  problemInk: "#991B1B",
  problemTint: "#FBE6E6",
  // The same tones by the names some screens use: sent, waiting, wrong.
  synced: "#166534",
  pending: "#92400E",
  attention: "#991B1B",
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 } as const;

export const size = {
  target: 48,
  primary: 56,
  radiusCard: 8,
  radiusPrimary: 12,
} as const;

export const type = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 24, fontWeight: "400" },
  bodyStrong: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  secondary: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
} as const;
