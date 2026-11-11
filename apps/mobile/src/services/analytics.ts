// Product analytics (KIT-130): events from the catalog in domain/analytics.ts, sent to PostHog's batch endpoint.
// Nothing is sent unless the cook allowed analytics at onboarding (the consent is kept on this phone) and the build
// has EXPO_PUBLIC_POSTHOG_KEY. The distinct id is the member id; events also carry the household id; there are no
// person profiles and no GeoIP. Sending is best effort: events wait in memory and are dropped if they can't be sent.
import "expo-sqlite/localStorage/install";

import Constants from "expo-constants";

import { sanitize, type EventName, type Props } from "@/domain/analytics";
import { useSession } from "@/state/session";

const CONSENT_KEY = "cookmate.analytics.consent";
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(/\/$/, "");
const FLUSH_MS = 5_000;
const MAX_QUEUE = 200;

type Captured = { event: string; properties: Record<string, unknown>; timestamp: string };
let queue: Captured[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function consented(): boolean {
  try {
    return globalThis.localStorage?.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

/** Kept from the onboarding consent screen (and any later change), so nothing is sent without it. */
export function setAnalyticsConsent(granted: boolean) {
  try {
    globalThis.localStorage?.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    // Without storage nothing is sent: consent can't be read back.
  }
  if (!granted) queue = [];
}

/** Forget everything: consent and unsent events (account deletion). */
export function resetAnalytics() {
  queue = [];
  try {
    globalThis.localStorage?.removeItem(CONSENT_KEY);
  } catch {
    // Nothing kept.
  }
}

export function analyticsEnabled(): boolean {
  return !!KEY && consented();
}

async function flush() {
  timer = null;
  if (!KEY || queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    const res = await fetch(`${HOST}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: KEY, batch }),
    });
    if (!res.ok && res.status >= 500) queue = [...batch, ...queue].slice(-MAX_QUEUE);
  } catch {
    queue = [...batch, ...queue].slice(-MAX_QUEUE); // offline: try again with the next event
  }
}

/** Records one catalog event. Properties outside the catalog, or that look like free text, are dropped. */
export function track(event: EventName, props: Props = {}) {
  if (!analyticsEnabled()) return;
  const clean = sanitize(event, props);
  if (!clean) return;
  const { householdId, memberId } = useSession.getState();
  queue.push({
    event,
    timestamp: new Date().toISOString(),
    properties: {
      ...clean,
      distinct_id: memberId ?? "anonymous",
      household_id: householdId,
      member_id: memberId,
      app_version: Constants.expoConfig?.version ?? null,
      $process_person_profile: false,
      $geoip_disable: true,
    },
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
}
