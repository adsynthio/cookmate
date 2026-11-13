// The scan tray: what several photos (and barcodes) found, gathered into one list to check once. Two photos of the
// same shelf often show the same paneer, so a repeat keeps the larger amount instead of adding them up; the cook can
// still change any amount on the check screen. Barcodes are one packet each, so those do add up. No React.

type Item = { said: string; ingredientKey: string | null; quantity: number | null; unit: string | null; confidence: number };

const idOf = (i: Item) => i.ingredientKey ?? i.said.trim().toLowerCase();

export function mergeTray<T extends Item>(tray: T[], found: T[], how: "photo" | "packet" = "photo"): T[] {
  const out = [...tray];
  for (const f of found) {
    const at = out.findIndex((t) => idOf(t) === idOf(f) && (t.unit === f.unit || t.quantity === null || f.quantity === null));
    if (at < 0) {
      out.push(f);
      continue;
    }
    const t = out[at]!;
    const unit = t.unit ?? f.unit;
    const quantity =
      t.quantity === null ? f.quantity : f.quantity === null ? t.quantity : how === "packet" ? t.quantity + f.quantity : Math.max(t.quantity, f.quantity);
    out[at] = { ...t, quantity, unit, confidence: Math.max(t.confidence, f.confidence) };
  }
  return out;
}
