// Picks mock or live services. Mocks are the default until each feature's backend ships (Sprint 6 swaps them).
import { liveServices } from "./live";
import { mockServices } from "./mock";
import type { Services } from "./types";

const useMocks = process.env.EXPO_PUBLIC_USE_MOCKS !== "0";

/** Live mode uses the Supabase backend for everything that has shipped; see live.ts for what still throws. */
export const services: Services = useMocks ? mockServices : liveServices;

export type { Services } from "./types";
export * from "./types";
