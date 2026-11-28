// The phone app's tokens: color, type, layout and spacing. Light theme
// only. Text is never under `secondary`
// (15 pt), a target never under 48 pt, the primary button 56 pt.
// Color: where a name is the office's too (apps/web/src/app/theme.css), the same value; a
// test fails when the two differ (apps/web/test/theme.test.ts). The phone is on D'Sierra's
// own scheme, as their homepage and sign-in are: their red for an action, their navy for
// what is chosen, a link, the active tab and a control's edge. Red never sits on navy
// (2.63:1). The office is on the same scheme; the status tones are shared.
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
  // Their navy's palest tint, a page under a navy band; and the quieter white on the navy.
  brandNavyTint: "#F3F2F7",
  onBrandNavySoft: "#BDB8D4",
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

// A card lifted off the page by a faint shadow of their navy.
export const lift = {
  shadowColor: color.brandNavy,
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

// How far a style grows with the phone's text size, at most: past it a long word no longer
// fits the smallest phone's line and breaks inside itself. Body text and labels to 2.3
// times (more than WCAG's 200%), a heading (20 pt and up) to twice its size, so it is never
// smaller than the text under it, display type (a band's title, a name set large) half again.
export const grows = { body: 2.3, heading: 2, display: 1.5 } as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 } as const;

export const size = {
  target: 48,
  primary: 56,
  radiusCard: 8,
  radiusPrimary: 12,
  // A pill's ends: round at any height.
  radiusPill: 999,
  // D'Sierra's mark above sign-in, on its rounded tile.
  mark: 72,
  radiusMark: 16,
  // The code field at sign-in, taller than a field for its larger digits.
  codeField: 64,
} as const;

// An icon: beside a small word, a status word, a line of body text, a row's choice mark, a
// control's own glyph, an empty state.
export const icon = {
  small: 16,
  status: 18,
  line: 20,
  row: 22,
  control: 24,
  large: 28,
} as const;

// A control's and a card's edge.
export const border = { hairline: 1 } as const;

// The ink behind an open sheet: the page shows through, dimmed.
export const scrim = "rgba(17, 24, 39, 0.4)";

export const type = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 24, fontWeight: "400" },
  bodyStrong: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  secondary: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  // A screen's title on the navy band and a name set large: Bodoni Moda, as D'Sierra's
  // wordmark and homepage headings are. The face draws its own weight; none is asked.
  display: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: "BodoniModa_700Bold",
    fontWeight: "normal",
  },
  // The running clock, the sign-in heading and the typed code: sizes no other text takes.
  timer: { fontSize: 56, lineHeight: 64, fontWeight: "600" },
  signInHeading: { fontSize: 32, lineHeight: 38 },
  code: { fontSize: 22, letterSpacing: 6 },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
} as const;
