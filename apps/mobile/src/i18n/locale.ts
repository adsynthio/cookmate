// Kept free of React Native imports so domain code and node tests can use the type.
/** Languages recipes and domain text are written in. */
export type Locale = "en" | "hi" | "hinglish";
/** Languages the app's own words can be shown in (F7: Kannada). Recipe text in Kannada reads English until written. */
export type AppLocale = Locale | "kn";
export const LOCALES: Locale[] = ["hi", "hinglish", "en"];
export const APP_LOCALES: AppLocale[] = ["hi", "hinglish", "en", "kn"];

/** The recipe and domain language for an app language: Kannada reads English recipe text for now. */
export function contentLocale(l: AppLocale): Locale {
  return l === "kn" ? "en" : l;
}
