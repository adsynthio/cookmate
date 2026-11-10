// "Morning kitchen light" design tokens (PRD §13). Pending design-lead approval (PLAN.md D7).
// Every colour, size and motion value in the app comes from here.

export const palette = {
  light: {
    bg: "#FAF6EF", // Rice Cream
    surface: "#F3E9D6", // Ghee
    text: "#2B2A28", // Masala Charcoal
    textMuted: "#6B655C", // Warm Stone
    primary: "#E5533D", // Tomato
    primaryText: "#C83F2A", // Tomato for small text (contrast)
    onPrimary: "#FFFFFF",
    highlight: "#F2B33D", // Haldi
    success: "#3F7D58", // Curry Leaf
    border: "#E6DCC8",
    tintHaldi: "#FCEFD2",
    tintTomato: "#FBE3DE",
    tintLeaf: "#E3F0E7",
    tintSky: "#E2ECF4",
  },
  dark: {
    bg: "#1C1A17",
    surface: "#26231F",
    text: "#F1EBE0",
    textMuted: "#B8AFA2",
    primary: "#EE6A55",
    primaryText: "#EE6A55",
    onPrimary: "#1C1A17",
    highlight: "#F5C25E",
    success: "#5FA67B",
    border: "#3A352E",
    tintHaldi: "rgba(242,179,61,0.12)",
    tintTomato: "rgba(229,83,61,0.12)",
    tintLeaf: "rgba(63,125,88,0.12)",
    tintSky: "rgba(120,160,200,0.12)",
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)["light"]]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { chip: 12, card: 24, sheet: 24, pill: 999 } as const;

export const font = {
  // Fraunces (headings) and Inter (body) load in Sprint 1; system fonts until then.
  heading: undefined as string | undefined,
  body: undefined as string | undefined,
} as const;

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "600" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  // COOK-01: readable at arm's length.
  cookStep: { fontSize: 30, lineHeight: 40, fontWeight: "600" },
} as const;

export const touch = {
  min: 48, // NFR-09
  cook: 56, // COOK-09
} as const;

export const motion = {
  quick: 150,
  standard: 250,
  spring: { damping: 18, stiffness: 180 },
} as const;
