// Shopping list helpers (KIT-110/112): group lines the way a shop is laid out, and write the list as plain text that
// reads fine in WhatsApp without the app. No React, no network.
import type { Locale } from "../i18n/locale";

export type ListLine = {
  id: string;
  /** Catalog key when the item is in the catalog. */
  ingredientKey: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  reason: "recipe_missing" | "running_low" | "predicted" | "manual" | "voice";
};

export const SECTIONS = ["produce", "dairy", "staples", "meat", "other"] as const;
export type Section = (typeof SECTIONS)[number];

const BY_CATEGORY: Record<string, Section> = {
  vegetable: "produce", fruit: "produce", herb: "produce",
  dairy: "dairy", egg: "dairy",
  grain: "staples", pulse: "staples", flour: "staples", spice: "staples", oil_fat: "staples", sweetener: "staples", nut_seed: "staples", condiment: "staples",
  meat: "meat", seafood: "meat",
};

export function sectionOf(category: string | undefined): Section {
  return (category && BY_CATEGORY[category]) || "other";
}

/** Lines grouped by shop section, sections in walking order, names A to Z inside each. Empty sections are left out. */
export function groupBySection<T extends ListLine>(
  lines: T[],
  categoryOf: (key: string) => string | undefined,
  nameOf: (line: T) => string,
): { section: Section; lines: T[] }[] {
  const groups = new Map<Section, T[]>();
  for (const line of lines) {
    const section = sectionOf(line.ingredientKey ? categoryOf(line.ingredientKey) : undefined);
    groups.set(section, [...(groups.get(section) ?? []), line]);
  }
  return SECTIONS.filter((s) => groups.has(s)).map((section) => ({
    section,
    lines: groups.get(section)!.sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
  }));
}

export function lineAmount(line: Pick<ListLine, "quantity" | "unit">): string {
  if (line.quantity === null) return "";
  const n = Number.isInteger(line.quantity) ? String(line.quantity) : String(Math.round(line.quantity * 100) / 100);
  return !line.unit || line.unit === "piece" ? n : `${n} ${line.unit}`;
}

const TITLE: Record<Locale, string> = { en: "Shopping list", hi: "ख़रीदारी की सूची", hinglish: "Shopping list" };

/** The list as text: a title, then each section with one item per line ("- Paneer, 200 g"). */
export function shareText<T extends ListLine>(
  groups: { section: Section; lines: T[] }[],
  sectionName: (s: Section) => string,
  nameOf: (line: T) => string,
  locale: Locale,
): string {
  const parts = [TITLE[locale]];
  for (const g of groups) {
    parts.push("", `${sectionName(g.section)}:`);
    for (const line of g.lines) {
      const amount = lineAmount(line);
      parts.push(`- ${nameOf(line)}${amount ? `, ${amount}` : ""}`);
    }
  }
  return parts.join("\n");
}
