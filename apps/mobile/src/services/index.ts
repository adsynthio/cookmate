// Picks mock or live services. Mocks are the default until each feature's backend ships (Sprint 6 swaps them).
import { liveServices } from "./live";
import { mockServices } from "./mock";
import type { Services } from "./types";

const useMocks = process.env.EXPO_PUBLIC_USE_MOCKS !== "0";

/**
 * In live mode, features whose backend is still pending fall back to mocks so the app stays usable.
 * Remove an entry here when the live implementation lands.
 */
export const services: Services = useMocks
  ? mockServices
  : {
      ...liveServices,
      recipe: mockServices.recipe, // suggest-meals ships in Sprint 3
    };

export type { Services } from "./types";
export * from "./types";
