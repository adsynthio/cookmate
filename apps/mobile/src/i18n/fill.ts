// Fills a string's {name} holes. English also has a tiny plural mark so a count of 1 reads right:
// "{n} thing{n|s}" is "1 thing" / "3 things", and "{n|have|has}" picks the second form when n is 1
// ("1 thing has", "3 things have"). Other languages don't need it: their strings read right with any numeral.
const PLURAL = /\{(\w+)\|([^|}]*)(?:\|([^}]*))?\}/g;
const HOLE = /\{(\w+)\}/g;

export function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template
    .replace(PLURAL, (_, name: string, many: string, one = "") => (Number(params[name]) === 1 ? one : many))
    .replace(HOLE, (_, name: string) => String(params[name] ?? `{${name}}`));
}
