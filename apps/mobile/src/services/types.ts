// Service interfaces: the ONLY way UI code reaches the backend (01_system_components.csv, "Service layer").
// Each service has a mock implementation (mock.ts) and a live one (live.ts) behind the same interface.
import type { Answer, ChangeResult, StepNote } from "@/domain/assist";
import type { Problem } from "@/domain/rescue";
import type { AgeGroup, Diet } from "@/domain/ranking";
import type { RecipeDoc } from "@/domain/recipes";
import type { Row } from "@/types/database";

export type MealSlot = Row<"recommendations">["meal_slot"];
export type LocationKind = Row<"storage_locations">["kind"];
export type StapleLevel = NonNullable<Row<"inventory_items">["staple_level"]>;
export type MemorySource = Row<"memories">["source"];
export type ItemState = Row<"inventory_items">["state"];
export type FlavorRole = "rich" | "heat" | "acid" | "crunch" | "starch" | "sweet";

export type PantryItem = {
  id: string;
  /** Canonical catalog name, or null for things not in the catalog (homemade chutney). */
  ingredientKey: string | null;
  /** Name as stored: catalog name or what the user called it. Show it through displayName(). */
  name: string;
  quantity: number | null;
  unit: string | null;
  location: LocationKind;
  stapleLevel: StapleLevel | null;
  expiryDate: string | null; // ISO date
  expiryEstimated: boolean;
  confidence: number;
  state: ItemState;
  flavorRoles: FlavorRole[];
  /** An unconfirmed guess from yesterday's dish (KIT-026); "Clear all guesses" removes these. */
  guess?: boolean;
};

/** An item on the confirm sheet, before it is added (KIT-031 read-back). */
export type DraftItem = {
  key: string;
  said: string;
  ingredientKey: string | null;
  quantity: number | null;
  unit: string | null;
  locationKind: LocationKind | null;
  state: ItemState | null;
  flavorRoles: FlavorRole[];
  confidence: number;
};

export type ItemChanges = {
  quantity?: number | null;
  unit?: string;
  stapleLevel?: StapleLevel;
  locationKind?: LocationKind;
  expiryDate?: string;
  customName?: string;
  /** "Still have this?" -> yes */
  confirm?: boolean;
};

export type AddedVia = "manual" | "voice" | "text";

export type Pick = {
  recommendationId: string;
  recipeId: string;
  slug: string;
  title: string;
  titles: RecipeDoc["titles"];
  /** One line citing a real factor, already in the user's language (KIT-040). */
  reason: string;
  /** Ingredient keys from the pantry this dish uses. */
  uses: string[];
  /** Ingredient keys still needed. */
  missing: string[];
  totalTimeMin: number | null;
  imageUrl: string | null;
  /** "You have 9 of 10" (confident items and staples only). */
  have: number;
  total: number;
  score: number;
};

/** hero is null when nothing fits the filters; the screen offers to clear them. */
export type PickBatch = { batchId: string; mealSlot: MealSlot; hero: Pick | null; alternates: Pick[] };

export type PickInput = {
  householdId: string;
  memberId: string;
  mealSlot?: MealSlot;
  craving?: string;
  chips?: string[];
  /** Member ids eating today (KIT-057); everyone when omitted. */
  whoEating?: string[];
  /** "Use these first": ingredient keys from the Use Soon strip (KIT-043). */
  focus?: string[];
  languageCode: string;
};

export type RecipeSummary = {
  id: string;
  slug: string;
  title: string;
  titles: RecipeDoc["titles"];
  course: string;
  diet: string;
  totalTimeMin: number | null;
  spiceLevel: number;
  tags: string[];
};

export type AdaptInput = {
  householdId: string;
  recipeId: string;
  missing?: string[];
  spice?: number;
  servings?: number;
  missingEquipment?: string[];
  diet?: Diet;
  maxTimeMin?: number;
};

export type AdaptResult = {
  /** Null when nothing safe could be made (see unresolved). */
  adaptedRecipeId: string | null;
  summary: string;
  changedSteps: number[];
  /** Essentials nothing replaces: the cook needs to buy them. */
  unresolved: string[];
};

export type Member = {
  id: string;
  displayName: string;
  ageGroup: AgeGroup;
  diet: Diet;
  spice: number;
  notes: string | null;
};

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
  /** KIT-057: who can be eating today. */
  listMembers(householdId: string): Promise<Member[]>;
  listMemories(householdId: string): Promise<Memory[]>;
  forgetMemory(memoryId: string): Promise<void>;
  keepMemory(memoryId: string): Promise<void>;
}

export interface KitchenService {
  getKitchen(householdId: string): Promise<PantryItem[]>;
  /** HOME-04 */
  getUseSoon(householdId: string, days?: number): Promise<PantryItem[]>;
  /** KIT-031: free text -> items to read back. Never writes. */
  parseItems(input: { householdId: string; text: string; languageCode: string }): Promise<{ items: DraftItem[]; source: string }>;
  /** KIT-031: add confirmed items; the same thing in the same place is topped up. */
  addItems(input: { householdId: string; items: DraftItem[]; addedVia: AddedVia }): Promise<string[]>;
  /** KIT-032: every change is logged as an inventory event. */
  updateItem(itemId: string, changes: ItemChanges): Promise<void>;
  finishItem(itemId: string, discarded: boolean): Promise<void>;
  /** Undo of finish/discard. */
  reopenItem(itemId: string): Promise<void>;
  /** KIT-026: yesterday's dish -> unconfirmed guesses (confidence 0.4). Returns the new item ids. */
  guessFromRecipe(householdId: string, recipeId: string): Promise<string[]>;
  /** KIT-026: clear guesses nobody confirmed (all of them, or just these). */
  clearGuesses(householdId: string, itemIds?: string[]): Promise<number>;
  /** KIT-033: Low/Out staples -> shopping list. */
  addToList(householdId: string, items: { name: string; reason: "running_low" | "manual" }[]): Promise<void>;
  /** KIT-030: pantry changes from other phones; returns an unsubscribe function. */
  subscribe(householdId: string, onChange: () => void): () => void;
}

export interface RecipeService {
  /** HOME-01: one hero pick and two alternates for the meal slot. */
  getPicks(input: PickInput): Promise<PickBatch>;
  /** "Cook this" or a dismissal; feeds novelty and, later, learning (HOME-06). */
  respondToPick(recommendationId: string, status: "accepted" | "dismissed", reason?: string): Promise<void>;
  /** KIT-050: full recipe by id or slug. */
  getRecipe(idOrSlug: string): Promise<RecipeDoc>;
  /** KIT-051: the household's own version (rules first, model only for gaps, always validated). */
  adaptRecipe(input: AdaptInput): Promise<AdaptResult>;
  /** KIT-054: search in any language and script. */
  searchRecipes(query: string): Promise<RecipeSummary[]>;
}

export type CookSession = {
  id: string;
  recipeId: string;
  currentStep: number;
  servings: number;
  whoEating: string[];
  status: "active" | "paused" | "completed" | "abandoned";
  /** KIT-075: what the cook did differently, with notes for later steps. */
  changes: { change: string; notes: StepNote[] }[];
};

export type DeductionLine = {
  itemId: string;
  ingredient: string;
  quantity: number | null;
  unit: string | null;
  currentQuantity: number | null;
  staple: boolean;
};

export type DeductionAdjustment = { itemId: string; quantity?: number; skip?: boolean; stapleLevel?: StapleLevel };

export type Rating = "loved" | "good" | "meh" | "bad";

export type { Answer, ChangeResult, StepNote } from "@/domain/assist";
export type RescueInput = { sessionId: string; problem: Problem; missing?: string; details?: string; languageCode: string };
/** At most three things to do now, plus the pinned safety line when one applies (KIT-091/092). */
export type RescueFix = { steps: string[]; safetyNote: string | null; source: "rules" | "model" };

export interface CookingService {
  /** KIT-070: start cooking a recipe (or its adapted variant). */
  startSession(input: {
    householdId: string;
    recipeId: string;
    servings: number;
    whoEating: string[];
    mode?: "touch" | "voice" | "hands_free";
    recommendationId?: string;
    languageCode: string;
  }): Promise<string>;
  getSession(sessionId: string): Promise<CookSession>;
  /** The cook's session in progress, to resume from the Cook tab. */
  getActiveSession(householdId: string): Promise<CookSession | null>;
  advanceStep(sessionId: string, delta: number, channel?: "touch" | "voice"): Promise<{ currentStep: number; total: number }>;
  /** Stop without finishing: nothing is deducted and the Cook tab stops offering to resume. */
  abandonSession(sessionId: string): Promise<void>;
  /** KIT-074: answer a question about the current step. The cook's place never moves. */
  ask(input: { sessionId: string; question: string; languageCode: string }): Promise<Answer>;
  /** KIT-075: record what the cook did differently; returns notes for the steps still ahead. */
  reportChange(input: { sessionId: string; change: string; languageCode: string }): Promise<ChangeResult>;
  /** KIT-091: a fix for this dish and step with what is in the kitchen. */
  rescue(input: RescueInput): Promise<RescueFix>;
  /** KIT-037: finish and preview what comes off the pantry. */
  completeSession(sessionId: string): Promise<DeductionLine[]>;
  applyDeduction(sessionId: string, adjustments: DeductionAdjustment[]): Promise<string[]>;
  submitFeedback(input: { sessionId: string; rating: Rating; tags?: string[]; comment?: string; makeAgain?: boolean }): Promise<void>;
}

export type VoiceToken = { url: string; token: string; roomName: string; languageCode: string };
/** Why a voice session couldn't start; anything else is an ordinary error. */
export type VoiceUnavailable = "not_configured" | "consent_needed";

export interface VoiceService {
  /** KIT-061: a token for one new room with the cooking agent dispatched to it. */
  getToken(input: { householdId: string; cookingSessionId?: string; languageCode: string }): Promise<VoiceToken | VoiceUnavailable>;
}

export type Services = {
  auth: AuthService;
  preference: PreferenceService;
  kitchen: KitchenService;
  recipe: RecipeService;
  cooking: CookingService;
  voice: VoiceService;
};
