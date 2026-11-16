// The crew app's tokens (DESIGN, Color palette, Typography, Layout and spacing). Light theme
// only. Values are DESIGN's: change them there first. Crew text is never under `secondary`
// (15 pt), a target never under 48 pt, the primary button 56 pt.
export const color = {
  ink: "#111827",
  inkSecondary: "#4B5563",
  border: "#D1D5DB",
  surface: "#FFFFFF",
  canvas: "#F3F4F6",
  accent: "#2808AC",
  onAccent: "#FFFFFF",
  brand: "#BC0C0C",
  synced: "#166534",
  pending: "#92400E",
  attention: "#991B1B",
  muted: "#6B7280",
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
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
} as const;
