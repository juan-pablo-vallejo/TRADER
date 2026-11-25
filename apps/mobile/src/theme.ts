// The phone app's tokens: color, type, layout and spacing. Light theme
// only. Text is never under `secondary`
// (15 pt), a target never under 48 pt, the primary button 56 pt.
// Color: the same names and values as the office's (apps/web/src/app/theme.css); a test
// fails when the two differ (apps/web/test/theme.test.ts). The accent is the color of
// every action; `brand` and `brandNavy` belong to the mark, never to a control or a status,
// save a control's edge, which is the navy, and the sign-in screen, which is on D'Sierra's
// brand as the office's is: its navy band and its one red button (ui/phone-sign-in.tsx).
export const color = {
  ink: "#111827",
  inkSecondary: "#4B5563",
  canvas: "#F5F6F8",
  surface: "#FFFFFF",
  // A hairline between things.
  border: "#D9DCE3",
  // The edge of a control, a field's included: the navy, 3:1 and more on white and canvas.
  controlBorder: "#140064",
  accent: "#2808AC",
  onAccent: "#FFFFFF",
  accentTint: "#EEEBFA",
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
  // What the screens built before the tones call them: sent, waiting, wrong.
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
