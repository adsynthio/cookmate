// F1, house-cook handoff (docs/AI_RECIPES_PLAN.md): tonight's dish as a plain message for whoever cooks, in the
// language they read. The family's allergies and dislikes come first, in capitals; then tonight's amounts and the
// steps with their safety notes. It is the checked recipe, translated by the app's own strings and the recipe's
// own Hindi and Hinglish, never new AI text. Pure: the caller resolves names, amounts and step text.

export type HandoffInput = {
  title: string;
  servings: number;
  /** Allergies and dislikes, as names in the cook's language. */
  avoid: string[];
  /** Remembered family notes for this dish ("less chilli"), in the cook's language. */
  notes: string[];
  ingredients: { name: string; amount: string }[];
  steps: { text: string; safety?: string }[];
  /** The app's strings in the cook's language. */
  words: { heading: string; avoid: string; notes: string; ingredients: string; steps: string; safety: string; footer: string };
};

export function handoffText(h: HandoffInput): string {
  const lines: string[] = [h.words.heading];
  if (h.avoid.length) lines.push("", `⚠️ ${h.words.avoid}: ${h.avoid.join(", ").toLocaleUpperCase()}`);
  if (h.notes.length) lines.push("", `${h.words.notes}:`, ...h.notes.map((n) => `• ${n}`));
  lines.push("", `${h.words.ingredients}:`, ...h.ingredients.map((i) => `• ${i.name}: ${i.amount}`));
  lines.push("", `${h.words.steps}:`);
  h.steps.forEach((s, n) => {
    lines.push(`${n + 1}. ${s.text}`);
    if (s.safety) lines.push(`   ⚠️ ${h.words.safety}: ${s.safety}`);
  });
  lines.push("", h.words.footer);
  return lines.join("\n");
}
