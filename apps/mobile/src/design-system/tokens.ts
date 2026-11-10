// Cookmate design tokens, from the brand kit (https://claude.ai/artifact/TKbPEX8dwZmtw9BbBHj67j).
// Every colour, size and motion value in the app comes from here. Keep in step with the kit's tokens.json.

export const palette = {
  light: {
    canvas: "#F6F6F6", // screen background
    surface: "#FFFFFF", // cards, round buttons
    surfaceMuted: "#F2F2F2", // badges, tags, unselected chips, bottom bar
    ink: "#111111", // text on everything, including lime
    inkSecondary: "#5E5E5E", // greeting, weekday letters, inactive nav
    inkTertiary: "#707070", // units after numbers (15px and up)
    line: "#E6E6E6", // hairlines, inactive dashes
    lime: "#9ED22A", // the brand: primary action, progress, centre button
    limePressed: "#7CA91D",
    limeText: "#4F7A0A", // lime as text or a meaningful icon on white/canvas
    limeSoft: "#D6F2A2", // hero card, selected day / chip
    limePale: "#EAF5CD", // ring track, light washes, image placeholders
    onLime: "#111111", // never white on lime (1.8:1)
    amber: "#FFC736", // flame glyph (decorative)
    amberSoft: "#FDE6BC", // flame badge
    orange: "#E27224", // activity glyph (decorative)
    orangeStrong: "#C2410C", // orange that carries meaning alone
    sky: "#04C2F8", // water glyph (decorative)
    alert: "#C8321F", // food safety, errors (Cookmate addition)
    alertSoft: "#FBE3DE",
  },
  dark: {
    canvas: "#0F110D",
    surface: "#1A1D16",
    surfaceMuted: "#24281F",
    ink: "#F4F6EF",
    inkSecondary: "#B4B9AA",
    inkTertiary: "#9AA090",
    line: "#2C3027",
    lime: "#9ED22A",
    limePressed: "#B5E255",
    limeText: "#B8E36A",
    limeSoft: "#2D3A12",
    limePale: "#23300C",
    onLime: "#111111",
    amber: "#FFC736",
    amberSoft: "#3A2E10",
    orange: "#F08A45",
    orangeStrong: "#F5A26B",
    sky: "#38D0FA",
    alert: "#FF7A66",
    alertSoft: "#3A1A14",
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)["light"]]: string };

/** 4-pt steps; `gutter` (18) is the measured screen margin and the gap between side-by-side cards. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 18, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { tag: 14, card: 20, cardLg: 24, sheet: 24, pill: 999 } as const;

/**
 * Inter for Latin script (Hinglish, English), Noto Sans Devanagari for Hindi, same sizes and weights.
 * React Native picks a font file per weight, so each weight is its own family name (loaded in app/_layout.tsx).
 */
export const fonts = {
  latin: { 400: "Inter_400Regular", 500: "Inter_500Medium", 600: "Inter_600SemiBold" },
  devanagari: {
    400: "NotoSansDevanagari_400Regular",
    500: "NotoSansDevanagari_500Medium",
    600: "NotoSansDevanagari_600SemiBold",
  },
} as const;

export type Weight = 400 | 500 | 600;
type TypeStyle = { fontSize: number; lineHeight: number; weight: Weight; letterSpacing?: number };

/** Measured from the reference on a 393-pt frame (brand kit, Typography). */
export const type = {
  display: { fontSize: 46, lineHeight: 55, weight: 500, letterSpacing: -0.92 },
  title: { fontSize: 24, lineHeight: 28, weight: 500, letterSpacing: -0.24 },
  metric: { fontSize: 28, lineHeight: 34, weight: 500, letterSpacing: -0.28 },
  heading: { fontSize: 20, lineHeight: 26, weight: 500 },
  bodyStrong: { fontSize: 17, lineHeight: 22, weight: 500 },
  body: { fontSize: 16, lineHeight: 21, weight: 400 },
  unit: { fontSize: 15, lineHeight: 20, weight: 400 },
  label: { fontSize: 14, lineHeight: 18, weight: 400 },
  caption: { fontSize: 13, lineHeight: 16, weight: 400 },
  wordmark: { fontSize: 23, lineHeight: 28, weight: 600, letterSpacing: -0.23 },
  // COOK-01: readable at arm's length.
  cookStep: { fontSize: 30, lineHeight: 40, weight: 500, letterSpacing: -0.3 },
} as const satisfies Record<string, TypeStyle>;

/** Devanagari matras need more room: +4 on any style tighter than 1.3x its size (brand kit). */
export const DEVANAGARI_EXTRA_LEADING = 4;

export const size = {
  badge: 40,
  thumb: 40,
  iconButton: 48, // 46 visible in the reference; 48 keeps the touch minimum
  fab: 58,
  cta: 64,
  ring: 100,
} as const;

export const touch = {
  min: 48, // NFR-09
  cook: 56, // COOK-09
} as const;

export const shadow = {
  float: { shadowColor: "#111111", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  glow: { shadowColor: "#9ED22A", shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;

export const motion = {
  quick: 150,
  standard: 250,
  spring: { damping: 18, stiffness: 180 },
} as const;
