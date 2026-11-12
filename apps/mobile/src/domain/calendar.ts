// Festivals and fasts (KIT-144, HOME-02). Pure TypeScript with no imports: runs in the app (mock mode, offline) and in
// the suggest-meals and notify Edge Functions (supabase/functions/_shared/calendar.ts is a generated copy).
//
// Global rows come from content/calendar. A festival only nudges fitting dishes up. A fast's food rules (no grains,
// no onion...) are followed only by households that keep it: keeping one copies it into the household's own rows.

export type CalendarRules = {
  avoid?: string[];
  prefer?: string[];
  note?: string;
  names?: { en?: string; hi?: string; "hi-Latn"?: string };
  /** On a household's copy: the global fast it keeps. */
  keeps?: string;
};

export type CalendarEvent = {
  id?: string;
  /** Null for global rows. */
  household_id?: string | null;
  event_date: string;
  end_date?: string | null;
  kind: string;
  name: string;
  regions?: string[] | null;
  rules: CalendarRules | null;
};

/** Running on `day` (YYYY-MM-DD) in the household's region. Global rows with no regions apply everywhere. */
export function eventsOn(rows: CalendarEvent[], day: string, region: string | null): CalendarEvent[] {
  return rows.filter((r) => {
    if (r.event_date > day || (r.end_date ?? r.event_date) < day) return false;
    if (r.household_id) return true;
    const regions = r.regions ?? [];
    return !regions.length || (!!region && regions.includes(region.toUpperCase()));
  });
}

/** The key a household's copy of a global fast carries, so the same fast on the same days is matched. */
export function fastKey(e: Pick<CalendarEvent, "name" | "event_date">): string {
  return `${e.name}@${e.event_date}`;
}

/**
 * Ranking preferences for today's events. Festivals and fasts nudge fitting dishes up for everyone; a fast's avoid
 * list applies only through the household's own copy (they keep it) or a household event (guests, exams...).
 */
export function calendarPrefs(today: CalendarEvent[]): { avoid: string[]; prefer: string[] } {
  const avoid = new Set<string>();
  const prefer = new Set<string>();
  for (const e of today) {
    for (const p of e.rules?.prefer ?? []) prefer.add(p);
    if (e.household_id) for (const a of e.rules?.avoid ?? []) avoid.add(a);
  }
  return { avoid: [...avoid], prefer: [...prefer] };
}

/** Global fasts running today that have food rules and that the household hasn't said it keeps. */
export function fastsToOffer(today: CalendarEvent[]): CalendarEvent[] {
  const kept = new Set(today.filter((e) => e.household_id && e.rules?.keeps).map((e) => e.rules!.keeps!));
  return today.filter((e) => !e.household_id && e.kind === "fast" && (e.rules?.avoid?.length ?? 0) > 0 && !kept.has(fastKey(e)));
}

/** The household's copy of a global fast, ready to insert. */
export function keepFast(e: CalendarEvent, householdId: string): CalendarEvent {
  return {
    household_id: householdId,
    event_date: e.event_date,
    end_date: e.end_date ?? null,
    kind: "fast",
    name: e.name,
    regions: [],
    rules: { ...(e.rules ?? {}), keeps: fastKey(e) },
  };
}

export function eventName(e: CalendarEvent, locale: "hi" | "hinglish" | "en"): string {
  const n = e.rules?.names;
  return (locale === "hi" ? n?.hi : locale === "hinglish" ? n?.["hi-Latn"] : n?.en) ?? e.name;
}
