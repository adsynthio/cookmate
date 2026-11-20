// The "answer straight away, don't think first" setting, which differs by model (Claude API, Nov 2026):
// - Claude Sonnet 5.5 rejects {type: "disabled"} with a 400 and takes {type: "between_tools"} instead (at effort high or
//   below). Sending "disabled" made every Sonnet call fail (tonight's picks, new and named dishes, adapting a recipe,
//   family recipes) until this helper; the app quietly fell back to its rules or said "couldn't write".
// - Claude Opus 5.x, Fable and Mythos can't switch thinking off: the field is left out (keep effort low instead).
// - Claude Haiku 5.5 and older models take {type: "disabled"}.
export type ThinkingOff = { thinking?: { type: "disabled" } | { type: "between_tools" } };

export function thinkingOff(model: string): ThinkingOff {
  if (model.startsWith("claude-sonnet-5-5")) return { thinking: { type: "between_tools" } };
  if (/^claude-(opus-5|fable|mythos)/.test(model)) return {};
  return { thinking: { type: "disabled" } };
}
