// "How much do you have?": a few one-tap amounts for each kind of thing, the way people buy it in India. Onion and
// atta by the kilo, milk by the litre, eggs by the half dozen, palak by the bunch, masala by the small packet.
// Amounts are stored in the item's own unit (g, ml, piece, bunch) so cooking can deduct from them.

export type AmountWord = "g" | "kg" | "ml" | "l" | "piece" | "packet" | "bunch";
/** Stored as quantity + unit; shown as `n` and a word the screen translates ("1 kg", "1 किलो", "2 गड्डी"). */
export type Amount = { quantity: number; unit: string; n: number; word: AmountWord };
type Entry = { name?: string; category?: string; unit?: string } | undefined;

const g = (n: number): Amount => ({ quantity: n, unit: "g", ...(n >= 1000 ? { n: n / 1000, word: "kg" } : { n, word: "g" }) });
const ml = (n: number): Amount => ({ quantity: n, unit: "ml", ...(n >= 1000 ? { n: n / 1000, word: "l" } : { n, word: "ml" }) });
const pc = (n: number): Amount => ({ quantity: n, unit: "piece", n, word: "piece" });
const packs = (n: number, per: number): Amount => ({ quantity: n * per, unit: "piece", n, word: "packet" });
const bunch = (n: number): Amount => ({ quantity: n, unit: "bunch", n, word: "bunch" });

/** Three or four amounts to tap, smallest first; empty when the item is unknown (the cook types it). */
export function amountChoices(entry: Entry): Amount[] {
  if (!entry) return [];
  const { category, unit, name } = entry;
  if (unit === "bunch") return [bunch(1), bunch(2), bunch(3)];
  if (category === "egg") return [pc(6), pc(12), pc(30)];
  if (name === "bread" || name === "pav") return [packs(1, name === "bread" ? 20 : 6), packs(2, name === "bread" ? 20 : 6)];
  if (unit === "piece") return [pc(2), pc(4), pc(6), pc(12)];
  if (unit === "ml") return name?.includes("oil") ? [ml(500), ml(1000), ml(5000)] : [ml(500), ml(1000), ml(2000)];
  switch (category) {
    case "vegetable":
    case "fruit":
      return [g(250), g(500), g(1000), g(2000)];
    case "grain":
    case "pulse":
    case "flour":
    case "sweetener":
      return [g(500), g(1000), g(2000), g(5000)];
    case "dairy":
    case "meat":
    case "seafood":
      return [g(200), g(500), g(1000)];
    case "spice":
    case "nut_seed":
    case "herb":
      return [g(50), g(100), g(200), g(500)];
    default:
      return [g(100), g(250), g(500), g(1000)];
  }
}

/** Items still without an amount, worth asking about: not staples (those are Full / Low / Out) and not leftovers. */
export function needsAmount(item: { quantity: number | null; stapleLevel: string | null; state: string }): boolean {
  return item.quantity === null && item.stapleLevel === null && item.state !== "leftover" && item.state !== "cooked";
}
