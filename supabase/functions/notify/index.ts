// notify (KIT-045, NOTIF-01, S3): pg_cron calls this every 15 minutes. For members whose nudge time has come (dinner
// time minus their lead, outside quiet hours, opted in, at most one proactive notification a day, backing off when
// ignored; the database decides who in notify_due), it ranks dinner with the same engine as suggest-meals, picks one
// dish that fits in about 20, 30 and 60 minutes (only what fits before dinner), stores them as a recommendation
// batch so the app opens straight onto them, and sends one push through Expo. It also removes export files older than 7 days.
// No user token: the caller proves itself with the shared secret kept in Vault (x-notify-secret).
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

import { reasonFor } from "../_shared/ranking.ts";
import { loadKitchen, rank } from "../suggest-meals/engine.ts";
import { localeFor } from "../suggest-meals/logic.ts";
import { dinnerMessage, type ExpoTicket, expoMessages, pickByTime, readTickets } from "./logic.ts";

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Due = {
  member_id: string;
  household_id: string;
  timezone: string;
  region: string | null;
  language: string;
  tokens: string[];
  dinner_time: string;
  lead_minutes: number;
};

async function sendPush(messages: ReturnType<typeof expoMessages>): Promise<ExpoTicket[]> {
  if (!messages.length) return [];
  const token = Deno.env.get("EXPO_ACCESS_TOKEN");
  const res = await fetch(EXPO_PUSH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`expo push ${res.status}`);
  const out = (await res.json()) as { data?: ExpoTicket[] };
  return out.data ?? [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: ok } = await admin.rpc("notify_secret_ok", { p_secret: req.headers.get("x-notify-secret") ?? "" });
  if (ok !== true) return json({ error: "forbidden" }, 403);

  const now = new Date();
  const summary = { due: 0, sent: 0, failed: 0, suppressed: 0, exports_removed: 0 };

  const { data: due, error } = await admin.rpc("notify_due", { p_now: now.toISOString() });
  if (error) return json({ error: error.message }, 500);
  const byHousehold = new Map<string, Due[]>();
  for (const d of (due ?? []) as Due[]) byHousehold.set(d.household_id, [...(byHousehold.get(d.household_id) ?? []), d]);
  summary.due = (due ?? []).length;

  for (const [householdId, members] of byHousehold) {
    const locale = localeFor(members[0]!.language);
    const lead = Math.min(...members.map((m) => m.lead_minutes));
    let choices: { bucket: number; recipeId: string; titles: { en: string; hi: string | null; hinglish: string | null } }[] = [];
    let batchId: string | null = null;
    try {
      // Tonight's options precomputed, one per time, so tapping the notification opens straight onto them.
      const r = rank(await loadKitchen(admin, admin, householdId, { slot: "dinner", locale }, now, { asService: true }), locale);
      const timed = pickByTime(r.ranked, (p) => p.recipe.timeMin || null, lead);
      choices = timed.map(({ bucket, pick }) => {
        const doc = r.docs.find((d) => d.id === pick.recipe.id);
        return { bucket, recipeId: pick.recipe.id, titles: { en: pick.recipe.title, hi: doc?.titles?.hi ?? null, hinglish: doc?.titles?.["hi-Latn"] ?? null } };
      });
      if (timed.length) {
        batchId = crypto.randomUUID();
        const { error: insErr } = await admin.from("recommendations").insert(timed.map(({ bucket, pick: p }, i) => ({
          household_id: householdId,
          member_id: members[0]!.member_id,
          batch_id: batchId,
          meal_slot: "dinner",
          context: { source: "daily_pick", minutes: bucket },
          recipe_id: p.recipe.id,
          rank: i,
          score: p.score,
          score_breakdown: p.breakdown,
          reason_text: reasonFor(p, r.ctx, locale, r.nameOf),
          uses_item_ids: p.match.items.filter((m) => m.entry).map((m) => m.entry!.itemId),
          missing: p.match.items.filter((m) => m.status === "missing").map((m) => ({ ingredient: m.key, substitute: m.substitute ?? null })),
          status: "shown",
        })));
        if (insErr) {
          console.error("notify: storing the pick failed", insErr.message);
          batchId = null;
        }
      }
    } catch (err) {
      console.error("notify: ranking failed", err instanceof Error ? err.message : err);
    }

    for (const m of members) {
      const ml = localeFor(m.language);
      const msg = dinnerMessage(choices.map((c) => ({ bucket: c.bucket, dish: (ml === "hi" ? c.titles.hi : ml === "hinglish" ? c.titles.hinglish : null) ?? c.titles.en })), m.dinner_time, ml);
      const data: Record<string, string> = { type: "daily_pick", ...(batchId ? { batch_id: batchId } : {}), ...(choices[0] ? { recipe_id: choices[0].recipeId } : {}) };
      // Nothing worth suggesting tonight: record it so the cap holds, but don't send an empty nudge.
      if (!choices.length) {
        await admin.from("notifications").insert({
          household_id: householdId, member_id: m.member_id, type: "daily_pick", channel: "push",
          scheduled_for: now.toISOString(), status: "suppressed", payload: { ...msg, data },
        });
        summary.suppressed++;
        continue;
      }
      const messages = expoMessages(m.tokens, msg, data);
      let status: "sent" | "failed" = "failed";
      try {
        const { delivered, dead } = readTickets(messages.map((x) => x.to), await sendPush(messages));
        status = delivered ? "sent" : "failed";
        if (dead.length) await admin.from("devices").update({ push_token: null }).in("push_token", dead);
      } catch (err) {
        console.error("notify: push failed", err instanceof Error ? err.message : err);
      }
      await admin.from("notifications").insert({
        household_id: householdId, member_id: m.member_id, type: "daily_pick", channel: "push",
        scheduled_for: now.toISOString(), sent_at: status === "sent" ? now.toISOString() : null, status, payload: { ...msg, data },
      });
      summary[status]++;
    }
  }

  // Export files older than 7 days (SECURITY_REVIEW #10). SQL can't delete storage objects; the storage API can.
  const { data: stale } = await admin.rpc("stale_exports", { p_days: 7 });
  // A set-returning function comes back as plain values or as {stale_exports: value} rows, depending on version.
  const names = ((stale ?? []) as (string | { stale_exports: string })[]).map((x) => (typeof x === "string" ? x : x.stale_exports));
  if (names.length) {
    const { data: removed } = await admin.storage.from("exports").remove(names);
    summary.exports_removed = removed?.length ?? 0;
  }
  return json(summary);
});
