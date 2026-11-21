// The sign-up and log-in screens have their own, louder look: market colours, die-cut fruit stickers, chunky outlined
// buttons with a hard coloured shadow, and Baloo 2 (a rounded Indian display face with Devanagari) for the big words.
// The rest of the app keeps its calm olive-and-cream system; these screens are the shop front.
import { Baloo2_800ExtraBold } from "@expo-google-fonts/baloo-2/800ExtraBold";
import { useFonts } from "expo-font";

import { useTheme } from "@/design-system/theme";
import { fonts } from "@/design-system/tokens";
import { getAppLocale } from "@/i18n";

import { INK } from "./fruitArt";

/** Big flat colours for the top of each screen. Each keeps white status-bar text readable on an iPhone. */
export const SCENE = {
  leaf: "#17A05D",
  melon: "#F0405F",
  brinjal: "#6A3DB0",
  mango: "#FFC53D",
  lemon: "#FFE14D",
  lime: "#B8E986",
  blush: "#FF9DAE",
  lilac: "#CDB6F2",
  peach: "#FFB27A",
} as const;

export type AuthColors = {
  canvas: string;
  surface: string;
  ink: string;
  inkSoft: string;
  /** Outlines and the edge of everything you press. */
  line: string;
  error: string;
};

const LIGHT: AuthColors = { canvas: "#FFF6E8", surface: "#FFFFFF", ink: INK, inkSoft: "#5E4A3C", line: INK, error: "#C4132F" };
const DARK: AuthColors = { canvas: "#1B1410", surface: "#2A201A", ink: "#FFF3E3", inkSoft: "#D9C7B5", line: "#FFF3E3", error: "#FF8A9B" };

export const DISPLAY_FONT = "Baloo2_800ExtraBold";

/**
 * Colours for light or dark, and the display font once it has loaded (only these screens load it, so cooks who are
 * already signed in never download it). Until then the app's own semibold stands in.
 */
export function useAuthLook() {
  const { scheme } = useTheme();
  const [loaded, error] = useFonts({ [DISPLAY_FONT]: Baloo2_800ExtraBold });
  return { colors: scheme === "dark" ? DARK : LIGHT, scheme, fontReady: loaded || !!error, display: loaded ? DISPLAY_FONT : null };
}

/**
 * Font and line height for big words in the current language (Kannada isn't in Baloo 2, so it keeps the system
 * face). `latin` is for words that are Latin whatever the language: the name, the code's digits.
 */
export function displayType(size: number, family: string | null, latin = false) {
  const locale = latin ? "en" : getAppLocale();
  const roomy = locale === "hi" || locale === "kn";
  const fallback = locale === "hi" ? fonts.devanagari[600] : fonts.latin[600];
  return {
    fontFamily: locale === "kn" ? undefined : (family ?? fallback),
    fontWeight: locale === "kn" || !family ? ("700" as const) : undefined,
    fontSize: size,
    // Baloo sits high and needs a little more room than Inter; Devanagari and Kannada need more again.
    lineHeight: Math.round(size * (roomy ? 1.32 : 1.12)),
  };
}
