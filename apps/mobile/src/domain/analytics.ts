// Analytics events (KIT-130, PRD §15, BR-20). The catalog is docs/architecture/12_analytics_events.csv: only the
// events and properties listed there are ever sent (a test keeps the two in step). Events carry household and member
// IDs and counts, never names, transcripts, recipe free text or pantry contents. Every value must look like an id,
// a code or a number: a string with a space, an @ or more than 64 characters is dropped, so free text cannot slip
// through even under an allowed property name.

export const EVENTS = {
  app_open: ["household_id", "member_id", "app_version", "network_type"],
  onboarding_step: ["step", "channel", "duration_ms"],
  onboarding_completed: ["members_count", "language", "voice_consent"],
  consent_changed: ["consent_type", "granted"],
  pick_shown: ["batch_id", "meal_slot", "source", "coverage_pct"],
  pick_accepted: ["recommendation_id", "rank", "channel"],
  pick_dismissed: ["recommendation_id", "reason"],
  craving_submitted: ["chips", "channel", "length_chars"],
  inventory_added: ["count", "added_via", "parse_confidence_avg"],
  inventory_corrected: ["field", "source"],
  inventory_consumed: ["items_count", "use_soon_items_count"],
  use_soon_shown: ["items_count"],
  recipe_viewed: ["recipe_id", "coverage_pct", "from"],
  recipe_adapted: ["recipe_id", "change_types"],
  cook_started: ["session_id", "mode", "recipe_id", "servings"],
  cook_step: ["session_id", "step_no", "channel"],
  timer_set: ["session_id", "duration_sec", "channel"],
  checkpoint_used: ["session_id", "verdict"],
  rescue_requested: ["session_id", "problem", "channel"],
  cook_completed: ["session_id", "duration_min", "mode", "taps_after_start", "rescues"],
  cook_abandoned: ["session_id", "last_step", "reason"],
  feedback_submitted: ["session_id", "rating", "tags_count"],
  memory_saved: ["category", "scope", "source"],
  memory_forgotten: ["category", "channel"],
  voice_session_started: ["context", "language"],
  voice_turn: ["latency_ms", "fast_path", "tool_name", "stt_confidence", "language"],
  voice_session_ended: ["turns", "duration_sec", "cost_inr", "end_reason"],
  list_item_added: ["reason", "channel"],
  list_items_bought: ["count"],
  notification_opened: ["type"],
} as const;

export type EventName = keyof typeof EVENTS;
export type PropValue = string | number | boolean | null | readonly string[];
export type Props = Record<string, PropValue | undefined>;

const TOKEN = /^[A-Za-z0-9_.:\-]{1,64}$/;
const MAX_LIST = 12;

function clean(v: PropValue | undefined): PropValue | undefined {
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") return TOKEN.test(v) ? v : undefined;
  if (Array.isArray(v)) {
    const ok = v.filter((x): x is string => typeof x === "string" && TOKEN.test(x)).slice(0, MAX_LIST);
    return ok.length === v.length || ok.length ? ok : undefined;
  }
  return undefined;
}

/**
 * The properties that may be sent for an event: listed in the catalog and shaped like an id, code or number.
 * Null for an event that isn't in the catalog. Household and member ids are added by the sender, not here.
 */
export function sanitize(event: string, props: Props = {}): Record<string, PropValue> | null {
  const allowed = (EVENTS as Record<string, readonly string[]>)[event];
  if (!allowed) return null;
  const out: Record<string, PropValue> = {};
  for (const key of allowed) {
    if (!(key in props)) continue;
    const v = clean(props[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}
