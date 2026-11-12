// Cookmate design tokens, from the Stitch "Kitchen AI" design system (warm cream, olive, terracotta), set in Inter.
// Every colour, size and motion value in the app comes from here.

export const palette = {
  light: {
    canvas: "#FDF9F2", // cream page background
    surface: "#FFFFFF", // cards, rows, round buttons
    surfaceMuted: "#F2EDE7", // chips, fields, quiet panels
    surfaceHigh: "#ECE8E1", // pressed fills, inactive segments, icon wells
    ink: "#1C1C18", // all text
    inkSecondary: "#46483E", // supporting text
    inkTertiary: "#77786D", // captions, metadata
    line: "#E6E1D9", // hairlines, dividers, progress track
    primary: "#505A34", // olive: confirmed actions, selected tab, focus
    primaryPressed: "#414B26",
    primaryText: "#505A34", // olive as text or a meaningful icon
    primaryContainer: "#68734A", // the olive feature card ("Pick up where you left off")
    primarySoft: "#DCE8B6", // selected chips, "can make now" badges, icon wells
    primaryPale: "#EEF2DF", // light washes, image placeholders
    onPrimary: "#FFFFFF",
    accent: "#A14016", // terracotta: cooking actions, timers, Use Soon
    accentPressed: "#812900",
    accentText: "#A14016",
    accentSoft: "#FFDBCF", // "use soon" badges, timer tint
    onAccent: "#FFFFFF",
    peach: "#FDDDBD", // selected ingredient chips, gentle tags
    peachText: "#69523A",
    alert: "#BA1A1A", // food safety, errors
    alertSoft: "#FFDAD6",
    onAlertSoft: "#93000A",
  },
  dark: {
    canvas: "#15140F",
    surface: "#1F1E19",
    surfaceMuted: "#29271F",
    surfaceHigh: "#333027",
    ink: "#EDE8DF",
    inkSecondary: "#C8C3B6",
    inkTertiary: "#9C988C",
    line: "#37342B",
    primary: "#C0CC9C",
    primaryPressed: "#DCE8B6",
    primaryText: "#C0CC9C",
    primaryContainer: "#414B26",
    primarySoft: "#3A4322",
    primaryPale: "#262B19",
    onPrimary: "#161E01",
    accent: "#FFB59B",
    accentPressed: "#FFDBCF",
    accentText: "#FFB59B",
    accentSoft: "#4A2312",
    onAccent: "#380D00",
    peach: "#4A3826",
    peachText: "#F1D3B4",
    alert: "#FFB4AB",
    alertSoft: "#4A1714",
    onAlertSoft: "#FFDAD6",
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)["light"]]: string };

/** 4-pt steps; `gutter` (20) is the screen margin from the Stitch layouts. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Rows 16, cards 24, feature cards 32, everything you press is a pill. */
export const radius = { tag: 12, item: 16, card: 24, cardLg: 32, sheet: 28, pill: 999 } as const;

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

/** Sizes from the Stitch design system, set in Inter. */
export const type = {
  display: { fontSize: 36, lineHeight: 42, weight: 500, letterSpacing: -0.72 },
  title: { fontSize: 26, lineHeight: 32, weight: 500, letterSpacing: -0.26 },
  metric: { fontSize: 28, lineHeight: 34, weight: 500, letterSpacing: -0.28 },
  heading: { fontSize: 22, lineHeight: 28, weight: 500, letterSpacing: -0.22 },
  subheading: { fontSize: 18, lineHeight: 24, weight: 600 },
  bodyStrong: { fontSize: 17, lineHeight: 24, weight: 500, letterSpacing: -0.17 },
  body: { fontSize: 15, lineHeight: 22, weight: 400, letterSpacing: -0.08 },
  unit: { fontSize: 15, lineHeight: 20, weight: 400 },
  label: { fontSize: 14, lineHeight: 20, weight: 500, letterSpacing: 0.14 },
  caption: { fontSize: 13, lineHeight: 18, weight: 400 },
  overline: { fontSize: 11, lineHeight: 14, weight: 600, letterSpacing: 0.66 },
  wordmark: { fontSize: 20, lineHeight: 26, weight: 600, letterSpacing: -0.2 },
  // COOK-01: readable at arm's length.
  cookStep: { fontSize: 28, lineHeight: 36, weight: 500, letterSpacing: -0.28 },
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

/** Warm, soft shadows (never blue-grey). */
export const shadow = {
  card: { shadowColor: "#24231F", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  float: { shadowColor: "#24231F", shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  glow: { shadowColor: "#A14016", shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;

export const motion = {
  quick: 150,
  standard: 260,
  slow: 420,
  /** Gap between items that ease in one after another. */
  stagger: 45,
  /** Press feedback: buttons and cards shrink a little. */
  pressScale: 0.97,
  spring: { damping: 18, stiffness: 180, mass: 1 },
  /** Bouncier, for things that pop in (badges, ticks). */
  pop: { damping: 12, stiffness: 220, mass: 0.8 },
} as const;
