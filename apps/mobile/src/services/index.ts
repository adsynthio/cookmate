// Picks mock or live services, wrapped so cooking keeps working when the network drops (KIT-076) and the catalog's
// analytics events are emitted (KIT-130).
import { liveServices } from "./live";
import { mockServices } from "./mock";
import { withOffline } from "./offline";
import { withAnalytics } from "./tracked";
import type { Services } from "./types";

const useMocks = process.env.EXPO_PUBLIC_USE_MOCKS !== "0";

/** Live mode uses the Supabase backend for everything that has shipped; see live.ts for what still throws. */
export const services: Services = withAnalytics(withOffline(useMocks ? mockServices : liveServices));

export type { Services } from "./types";
export * from "./types";
