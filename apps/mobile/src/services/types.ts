// Service interfaces: the ONLY way UI code reaches the backend (01_system_components.csv, "Service layer").
// Each service has a mock implementation (mock.ts) and a live one (live.ts) behind the same interface.
import type { Answer, ChangeResult, StepNote } from "@/domain/assist";
import type { VoiceProfile } from "@/domain/voiceStyle";
import type { Problem } from "@/domain/rescue";
import type { ListLine } from "@/domain/shopping";
import type { PlateWeek } from "@/domain/plate";
import type { RestockDue } from "@/domain/restock";
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

export type AddedVia = "manual" | "voice" | "text" | "camera" | "barcode" | "receipt" | "onboarding";

/** KIT-160/161/162: what to read: a photo of a fridge or shelf, a photo of a shop bill, or one barcode. */
export type ScanInput =
  | { householdId: string; kind: "fridge" | "bill"; image: string; mediaType?: "image/jpeg" | "image/png" }
  | { householdId: string; kind: "barcode"; code: string };

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
export type PickBatch = {
  batchId: string;
  mealSlot: MealSlot;
  hero: Pick | null;
  alternates: Pick[];
  /** KIT-035: today's one "Still have X?" question, only when the answer changes the pick. */
  check?: PantryQuestion | null;
  /** KIT-144: festivals and fasts today, and a fast the household might be keeping. */
  calendar?: CalendarToday | null;
  /** Who chose these: the model's chef step, or the rules when there is no model or its answer failed the checks. */
  chosenBy?: "model" | "rules";
  /** An everyday dish beyond Cookmate's recipes that this kitchen can make tonight; tap to have it written out. */
  newDish?: { name: string; why: string } | null;
};

export type PantryQuestion = { itemId: string; name: string; ifYes: string | null; ifNo: string | null };

export type EventNames = { en?: string; hi?: string; "hi-Latn"?: string } | null;
export type CalendarToday = {
  today: { id: string | null; name: string; kind: string; kept: boolean; names: EventNames }[];
  offerFast: { id: string | null; name: string; names: EventNames; note: string | null } | null;
};

/** KIT-045: the daily pick notification. Times are HH:MM in the household's timezone. */
export type NotificationSettings = { dailyPick: boolean; pickTime: string; quietStart: string; quietEnd: string };

/** KIT-056: a dish invented from the odds and ends in the kitchen, saved as the household's own "new creation". */
export type InventResult =
  | { recipeId: string; title: string; titles?: EventNames; description: string; uses: string[]; toBuy?: string[]; named?: boolean }
  | { recipeId: null; reason: "too_little" | "nothing_safe" | "unavailable" };

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
  memberId: string | null;
  memberName: string | null;
  /** The dish this is about, when it is about one. */
  recipeId: string | null;
  /** The aspect it is about: "preference" (a like or dislike), "amount", or a feedback subject such as "salt". */
  about: string | null;
  polarity: -1 | 0 | 1;
  /** For about = "amount": use more or less of the ingredient. */
  amount: "more" | "less" | null;
  /** Catalog name of the ingredient this is about, when it is about one. */
  ingredientKey: string | null;
};

export type NewMemory = {
  householdId: string;
  memberId?: string;
  statement: string;
  category: "taste" | "ingredient" | "technique" | "routine" | "household" | "diet" | "equipment" | "other";
  polarity?: -1 | 0 | 1;
  /** Subject key, so a newer memory about the same thing replaces the older one. */
  about?: string;
  recipeId?: string;
  /** Catalog name of the ingredient this is about (KIT-105 likes and dislikes, KIT-104 amounts). */
  ingredientKey?: string;
  /** With about = "amount": more or less of the ingredient from now on. Keep polarity 0 for these. */
  amount?: "more" | "less";
};

export type NewMember = {
  displayName: string;
  ageGroup?: "child" | "teen" | "adult" | "elder";
  diet?: "veg" | "eggetarian" | "nonveg" | "jain" | "vegan";
  spice?: 1 | 2 | 3 | 4 | 5;
  isSelf?: boolean;
  /** Taste profile: regional cuisines the household likes and the weekday time limit (minutes; null = none). */
  preferredCuisines?: string[];
  maxTimeMin?: number | null;
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
  /** The app language, kept on the account so the next launch (and the voice agent) uses it: "hi-IN", "en-IN". */
  setLanguage(languageCode: string): Promise<void>;
  /** KIT-021: the verified phone on this account (E.164), or null while it is anonymous. */
  getPhone(): Promise<string | null>;
  /** KIT-021: text a code to this phone to link it to the current (anonymous) account. Same user, same data. */
  startPhoneLink(phone: string): Promise<"sent" | "not_configured" | "taken">;
  /** KIT-021: the code from the text message. False when the code is wrong or expired. */
  confirmPhoneLink(phone: string, code: string): Promise<boolean>;
  /** KIT-121: a zip of everything about this household; the link works for 24 hours. */
  exportData(householdId: string): Promise<{ url: string; expiresAt: string }>;
  /** KIT-122: delete this account now. `confirm` is the word the cook typed. Signs out afterwards. */
  deleteAccount(confirm: string): Promise<void>;
}

export type { VoiceProfile } from "@/domain/voiceStyle";

export interface PreferenceService {
  createHousehold(input: { name: string; language: string; members: NewMember[] }): Promise<{ householdId: string; memberId: string }>;
  /** ONB-05: append-only consent records (DPDP); one row per purpose asked. */
  recordConsents(input: { householdId: string; memberId: string; policyVersion: string; consents: ConsentRecord[] }): Promise<void>;
  /** KIT-057: who can be eating today. */
  listMembers(householdId: string): Promise<Member[]>;
  listMemories(householdId: string): Promise<Memory[]>;
  forgetMemory(memoryId: string): Promise<void>;
  keepMemory(memoryId: string): Promise<void>;
  /** KIT-101: something the user said or confirmed. Returns the memory's id. */
  saveMemory(input: NewMemory): Promise<string>;
  /** KIT-102 Edit: the user's own words replace ours. */
  updateMemory(memoryId: string, statement: string): Promise<void>;
  /** KIT-068: how Cookmate talks to this member (by voice and when the app reads aloud). */
  getVoiceProfile(memberId: string): Promise<VoiceProfile>;
  updateVoiceProfile(memberId: string, changes: Partial<VoiceProfile>): Promise<void>;
  /** KIT-045: this member's daily pick notification (off until they turn it on). */
  getNotificationSettings(householdId: string): Promise<NotificationSettings>;
  /** Turning the daily pick on or off records the notifications consent. Rejects a pick time inside quiet hours. */
  setNotificationSettings(householdId: string, changes: Partial<NotificationSettings>): Promise<NotificationSettings>;
  /** This phone's push token, so the daily pick can reach it. */
  registerDevice(input: { householdId: string; memberId: string; pushToken: string; platform: "android" | "ios"; appVersion?: string; locale?: string }): Promise<void>;
}

export interface KitchenService {
  getKitchen(householdId: string): Promise<PantryItem[]>;
  /** HOME-04 */
  getUseSoon(householdId: string, days?: number): Promise<PantryItem[]>;
  /** KIT-031: free text -> items to read back. Never writes. */
  parseItems(input: { householdId: string; text: string; languageCode: string }): Promise<{ items: DraftItem[]; source: string }>;
  /**
   * KIT-160/161/162: a photo or a barcode -> items to read back. Never writes, and the photo is not kept.
   * source: "model" / "barcode" when something was found, "barcode_unknown", "unreadable" or "not_configured" when not.
   */
  scanItems(input: ScanInput): Promise<{ items: DraftItem[]; source: string }>;
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
  addToList(householdId: string, items: { name: string; reason: "running_low" | "manual" | "predicted" }[]): Promise<void>;
  /** KIT-181: things this household usually buys that are about to run out, soonest first (needs buying history). */
  restockDue(householdId: string): Promise<RestockDue[]>;
  /** KIT-110: what still needs buying. */
  getList(householdId: string): Promise<ListLine[]>;
  /** KIT-111: bought items go into the pantry; no ids means everything on the list. Returns pantry item ids. */
  markBought(householdId: string, itemIds?: string[]): Promise<string[]>;
  removeFromList(itemId: string): Promise<void>;
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
  /** KIT-055: the household's saved dishes, newest first. */
  listFavourites(householdId: string): Promise<RecipeSummary[]>;
  /** KIT-055: save or unsave a dish for the household. */
  setFavourite(input: { householdId: string; memberId: string; recipeId: string; on: boolean }): Promise<void>;
  /** KIT-045: the batch the daily pick notification was about, already ranked (opens instantly). */
  getBatch(householdId: string, batchId: string): Promise<PickBatch | null>;
  /** KIT-144: the household keeps this fast today, so picks follow its food rules. */
  keepFast(householdId: string, eventId: string): Promise<void>;
  /**
   * KIT-056: invent a dish from what's here; never returns one that failed the safety checks. With `dish`, write that
   * dish the home way from this kitchen instead (at most three things to buy, returned in toBuy).
   */
  inventDish(householdId: string, dish?: string): Promise<InventResult>;
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
export type { ListLine } from "@/domain/shopping";
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
  /** KIT-171: meals cooked to the end, counted by food group, for this week and the weeks before it (newest first). */
  weeklyPlate(householdId: string, weeks?: number): Promise<PlateWeek[]>;
  /** KIT-076: links to the cached step recordings this cook would hear, to download while there is network. */
  getStepAudio(sessionId: string): Promise<{ stepNo: number; url: string }[]>;
}

export type VoiceToken = { url: string; token: string; roomName: string; languageCode: string };
/** Why a voice session couldn't start; anything else is an ordinary error. */
export type VoiceUnavailable = "not_configured" | "consent_needed";

export interface VoiceService {
  /** KIT-061: a token for one new room with the cooking agent dispatched to it. */
  getToken(input: { householdId: string; cookingSessionId?: string; languageCode: string }): Promise<VoiceToken | VoiceUnavailable>;
}

// --- Community (private cooking circles) ---------------------------------------------------------------------------

export type Circle = {
  id: string;
  name: string;
  /** This household's role in the circle. */
  role: "owner" | "member";
  /** How each household appears in the circle ("Sunita's kitchen"). */
  members: { displayName: string; mine: boolean }[];
};

export type CommunityPost = {
  id: string;
  circleId: string;
  circleName: string;
  authorName: string;
  recipeId: string | null;
  recipeSlug: string | null;
  dishTitle: string;
  note: string | null;
  changes: string[];
  createdAt: string;
  mine: boolean;
  canRemove: boolean;
};

export type ReportReason = "spam" | "unsafe" | "offensive" | "other";
/** Why joining or sharing failed, in words the screen can show. */
export type CommunityProblem = "invite_not_found" | "circle_full" | "too_many_circles" | "too_many_posts";
export class CommunityError extends Error {
  constructor(readonly problem: CommunityProblem) {
    super(problem);
  }
}

export interface CommunityService {
  listCircles(householdId: string): Promise<Circle[]>;
  createCircle(input: { householdId: string; name: string; displayName: string }): Promise<string>;
  /** An 8-character code that lets another household join for 7 days. */
  createInvite(circleId: string, householdId: string): Promise<string>;
  join(input: { code: string; householdId: string; displayName: string }): Promise<string>;
  leave(circleId: string, householdId: string): Promise<void>;
  feed(householdId: string, circleId?: string): Promise<CommunityPost[]>;
  share(input: {
    circleId: string;
    householdId: string;
    recipeId: string | null;
    recipeSlug: string | null;
    dishTitle: string;
    note?: string;
    changes: string[];
  }): Promise<string>;
  removePost(postId: string, householdId: string): Promise<void>;
  report(postId: string, householdId: string, reason: ReportReason): Promise<void>;
}

/** "Ask Cookmate anything": a short answer from this household's kitchen, family and recipes. */
export type AskReply = { answer: string; recipes: { slug: string; title: string }[]; addToList: string[]; followUps: string[]; source: "model" | "fallback" | "local" };
export interface AssistantService {
  ask(input: { householdId: string; question: string; history: { role: "user" | "assistant"; text: string }[]; languageCode: string }): Promise<AskReply>;
}

export type Services = {
  auth: AuthService;
  assistant: AssistantService;
  preference: PreferenceService;
  kitchen: KitchenService;
  recipe: RecipeService;
  cooking: CookingService;
  voice: VoiceService;
  community: CommunityService;
};
