// Service interfaces: the ONLY way UI code reaches the backend (01_system_components.csv, "Service layer").
// Each service has a mock implementation (mock.ts) and a live one (live.ts) behind the same interface.
import type { Row } from "@/types/database";

export type MealSlot = Row<"recommendations">["meal_slot"];
export type LocationKind = Row<"storage_locations">["kind"];
export type StapleLevel = NonNullable<Row<"inventory_items">["staple_level"]>;
export type MemorySource = Row<"memories">["source"];

export type PantryItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location: LocationKind;
  stapleLevel: StapleLevel | null;
  expiryDate: string | null; // ISO date
  expiryEstimated: boolean;
  confidence: number;
};

export type Pick = {
  recommendationId: string;
  recipeId: string;
  title: string;
  reason: string;
  uses: string[];
  missing: string[];
  totalTimeMin: number | null;
  imageUrl: string | null;
};

export type PickBatch = { batchId: string; mealSlot: MealSlot; hero: Pick; alternates: Pick[] };

export type Memory = {
  id: string;
  statement: string;
  source: MemorySource;
  scope: "permanent" | "temporary";
  memberName: string | null;
};

export type NewMember = {
  displayName: string;
  ageGroup?: "child" | "teen" | "adult" | "elder";
  diet?: "veg" | "eggetarian" | "nonveg" | "jain" | "vegan";
  spice?: 1 | 2 | 3 | 4 | 5;
  isSelf?: boolean;
};

export type HouseholdRef = { householdId: string; memberId: string; languageCode: string | null };

export type ConsentRecord = {
  purpose: "voice_processing" | "transcript_retention" | "memory" | "analytics" | "notifications" | "whatsapp" | "marketing";
  granted: boolean;
};

export interface AuthService {
  /** ONB-01: "Try now" — anonymous account, no email or password. */
  ensureSignedIn(): Promise<{ userId: string; isAnonymous: boolean }>;
  /** The household this device last used, or null when onboarding is still needed. Never signs in. */
  getCurrentHousehold(): Promise<HouseholdRef | null>;
}

export interface PreferenceService {
  createHousehold(input: { name: string; language: string; members: NewMember[] }): Promise<{ householdId: string; memberId: string }>;
  /** ONB-05: append-only consent records (DPDP); one row per purpose asked. */
  recordConsents(input: { householdId: string; memberId: string; policyVersion: string; consents: ConsentRecord[] }): Promise<void>;
  listMemories(householdId: string): Promise<Memory[]>;
  forgetMemory(memoryId: string): Promise<void>;
  keepMemory(memoryId: string): Promise<void>;
}

export interface KitchenService {
  getKitchen(householdId: string): Promise<PantryItem[]>;
  /** HOME-04 */
  getUseSoon(householdId: string, days?: number): Promise<PantryItem[]>;
}

export interface RecipeService {
  /** HOME-01: one hero pick and two alternates for the meal slot. */
  getPicks(input: { householdId: string; memberId: string; mealSlot?: MealSlot; craving?: string; chips?: string[] }): Promise<PickBatch>;
}

export type Services = {
  auth: AuthService;
  preference: PreferenceService;
  kitchen: KitchenService;
  recipe: RecipeService;
};
