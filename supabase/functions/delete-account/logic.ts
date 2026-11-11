// delete-account logic (KIT-122): the cook must type the confirmation word in their own language.

export const CONFIRM_WORDS = ["DELETE", "हटाएँ", "HATAO"];

export function confirmed(input: unknown): boolean {
  return typeof input === "string" && CONFIRM_WORDS.includes(input.trim().toUpperCase().normalize("NFC"));
}
