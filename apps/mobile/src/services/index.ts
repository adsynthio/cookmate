// Picks mock or live services, wrapped so cooking keeps working when the network drops (KIT-076).
import { liveServices } from "./live";
import { mockServices } from "./mock";
import { withOffline } from "./offline";
import type { Services } from "./types";

const useMocks = process.env.EXPO_PUBLIC_USE_MOCKS !== "0";

/** Live mode uses the Supabase backend for everything that has shipped; see live.ts for what still throws. */
export const services: Services = withOffline(useMocks ? mockServices : liveServices);

export type { Services } from "./types";
export * from "./types";
