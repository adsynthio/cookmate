// F9 (docs/AI_RECIPES_PLAN.md): from the shopping list to a grocery app. None of the big quick-commerce apps offers
// a public cart API, so Cookmate opens the chosen app's own search for one item at a time and the cook orders there.
// Cookmate never orders or pays for anything; only the item's name leaves the phone, and only when the cook taps.
// Pure TypeScript.

export type Store = "blinkit" | "zepto" | "bigbasket";
export const STORES: Store[] = ["blinkit", "zepto", "bigbasket"];

const SEARCH: Record<Store, string> = {
  blinkit: "https://blinkit.com/s/?q=",
  zepto: "https://www.zeptonow.com/search?query=",
  bigbasket: "https://www.bigbasket.com/ps/?q=",
};

/** The store's search page for an item, by its plain English name (what the store's search understands best). */
export function storeSearchUrl(store: Store, item: string): string {
  const q = item.replace(/\s+/g, " ").trim().slice(0, 60);
  return SEARCH[store] + encodeURIComponent(q);
}
