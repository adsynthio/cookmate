// Live services backed by Supabase. Features whose backend has not shipped yet throw NotImplemented,
// and the app keeps using mocks for them (see services/index.ts).
import { catalogIndex } from "@/data/catalog";
import { changeReply, type StepNote } from "@/domain/assist";
import { DEFAULT_PROFILE, type VoiceProfile } from "@/domain/voiceStyle";
import type { ListLine } from "@/domain/shopping";
import { localeFromLanguageCode } from "@/domain/onboarding";
import { parsePantryText, type ParsedItem } from "@/domain/pantryParse";

import { requireSupabase } from "./supabase";
import type { Json } from "@/types/database";

import { toDraft, toRpcItem } from "./drafts";
import { RECIPE_SELECT, recipeDocFromRow, type RecipeRow } from "@/domain/recipes";
import { keepFast, type CalendarEvent } from "@/domain/calendar";

import type {
  CookSession,
  FlavorRole,
  LocationKind,
  MealSlot,
  Member,
  Memory,
  NotificationSettings,
  PantryItem,
  Pick,
  PickBatch,
  RecipeSummary,
  Services,
} from "./types";

type UseSoonRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location_kind: LocationKind;
  expiry_date: string;
  days_left: number;
  confidence: number;
};

/** One item in the parse-inventory response (08_api_contracts.csv). */
type ParseInventoryItem = {
  name: string;
  ingredient_id: string | null;
  ingredient_key: string | null;
  quantity: number | null;
  unit: string | null;
  location_kind: ParsedItem["locationKind"];
  state: ParsedItem["state"];
  confidence: number;
};

export class NotImplemented extends Error {
  constructor(what: string) {
    super(`${what} is not implemented in the live backend yet`);
  }
}

export const liveServices: Services = {
  auth: {
    async ensureSignedIn() {
      const sb = requireSupabase();
      const { data: existing } = await sb.auth.getSession();
      if (existing.session) {
        return { userId: existing.session.user.id, isAnonymous: existing.session.user.is_anonymous ?? true };
      }
      const { data, error } = await sb.auth.signInAnonymously();
      if (error || !data.user) throw error ?? new Error("anonymous sign-in failed");
      return { userId: data.user.id, isAnonymous: true };
    },

    async getPhone() {
      const { data } = await requireSupabase().auth.getUser();
      const phone = data.user?.phone;
      return phone ? (phone.startsWith("+") ? phone : `+${phone}`) : null;
    },
    async startPhoneLink(phone) {
      // Linking keeps the same user id, so every household row stays exactly where it is (ONB-01).
      const { error } = await requireSupabase().auth.updateUser({ phone });
      if (!error) return "sent";
      const code = (error as { code?: string }).code ?? "";
      if (code === "phone_exists") return "taken";
      if (code === "phone_provider_disabled" || code === "sms_send_failed" || /provider|sms/i.test(error.message)) return "not_configured";
      throw error;
    },
    async confirmPhoneLink(phone, code) {
      const { error } = await requireSupabase().auth.verifyOtp({ phone, token: code, type: "phone_change" });
      if (!error) return true;
      if ((error as { code?: string }).code === "otp_expired" || /token|otp|expired|invalid/i.test(error.message)) return false;
      throw error;
    },

    async exportData(householdId) {
      const { data, error } = await requireSupabase().functions.invoke("export-data", { body: { household_id: householdId } });
      if (error) throw error;
      return { url: data.url as string, expiresAt: data.expires_at as string };
    },
    async deleteAccount(confirm) {
      const sb = requireSupabase();
      const { error } = await sb.functions.invoke("delete-account", { body: { confirm } });
      if (error) throw error;
      await sb.auth.signOut({ scope: "local" });
    },

    async getCurrentHousehold() {
      const sb = requireSupabase();
      const { data: auth } = await sb.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) return null;
      const { data: profile, error } = await sb
        .from("profiles")
        .select("last_active_household_id, preferred_language")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      const householdId = profile?.last_active_household_id;
      if (!householdId) return null;
      const { data: member, error: memberError } = await sb
        .from("household_members")
        .select("id")
        .eq("household_id", householdId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member) return null;
      return { householdId, memberId: member.id, languageCode: profile.preferred_language };
    },
    async setLanguage(languageCode) {
      const sb = requireSupabase();
      const { data: auth } = await sb.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) return;
      const { error } = await sb.from("profiles").update({ preferred_language: languageCode }).eq("id", userId);
      if (error) throw error;
    },
  },

  preference: {
    async createHousehold({ name, language, members }) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("create_household", {
        p_name: name,
        p_language: language,
        p_members: members.map((m) => ({
          display_name: m.displayName,
          age_group: m.ageGroup,
          diet: m.diet,
          spice: m.spice,
          is_self: m.isSelf ?? false,
          preferred_cuisines: m.preferredCuisines ?? [],
          max_time_min: m.maxTimeMin ?? null,
        })),
      });
      if (error) throw error;
      const result = data as { household_id: string; member_id: string };
      return { householdId: result.household_id, memberId: result.member_id };
    },

    async recordConsents({ householdId, memberId, policyVersion, consents }) {
      const sb = requireSupabase();
      const { error } = await sb.from("consents").insert(
        consents.map((c) => ({
          household_id: householdId,
          member_id: memberId,
          consent_type: c.purpose,
          granted: c.granted,
          policy_version: policyVersion,
          channel: "tap" as const,
        })),
      );
      if (error) throw error;
    },

    async listMembers(householdId) {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("household_members")
        .select("id, display_name, age_group, diet, notes, taste_profiles(spice)")
        .eq("household_id", householdId)
        .eq("status", "active")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((m) => {
        const tp = (Array.isArray(m.taste_profiles) ? m.taste_profiles[0] : m.taste_profiles) as { spice: number | null } | null;
        return {
          id: m.id,
          displayName: m.display_name,
          ageGroup: (m.age_group ?? "adult") as Member["ageGroup"],
          diet: (m.diet ?? "veg") as Member["diet"],
          spice: tp?.spice ?? (m.age_group === "child" ? 1 : 3),
          notes: m.notes,
        };
      });
    },

    async listMemories(householdId) {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("memories")
        .select("id, statement, source, scope, polarity, attributes, member_id, subject_recipe_id, household_members(display_name), ingredients(canonical_name)")
        .eq("household_id", householdId)
        .eq("status", "active")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row): Memory => {
        const m = row as typeof row & { household_members?: { display_name: string } | null; ingredients?: { canonical_name: string } | null };
        const attributes = (m.attributes ?? {}) as { about?: string; amount?: string };
        return {
          id: m.id,
          statement: m.statement,
          source: m.source,
          scope: m.scope as Memory["scope"],
          memberId: m.member_id,
          memberName: m.household_members?.display_name ?? null,
          recipeId: m.subject_recipe_id,
          about: attributes.about ?? null,
          polarity: (m.polarity > 0 ? 1 : m.polarity < 0 ? -1 : 0) as Memory["polarity"],
          amount: attributes.amount === "more" || attributes.amount === "less" ? attributes.amount : null,
          ingredientKey: m.ingredients?.canonical_name ?? null,
        };
      });
    },

    async forgetMemory(memoryId) {
      const { error } = await requireSupabase().rpc("forget_memory", { p_memory: memoryId });
      if (error) throw error;
    },
    async keepMemory(memoryId) {
      const { error } = await requireSupabase().rpc("keep_memory", { p_memory: memoryId });
      if (error) throw error;
    },
    async saveMemory(input) {
      const sb = requireSupabase();
      let ingredientId: string | undefined;
      if (input.ingredientKey) {
        const found = await sb.from("ingredients").select("id").eq("canonical_name", input.ingredientKey).maybeSingle();
        if (found.error) throw found.error;
        ingredientId = found.data?.id;
      }
      const { data, error } = await sb.rpc("save_memory", {
        p_household: input.householdId,
        p_statement: input.statement,
        p_member: input.memberId,
        p_category: input.category,
        p_source: "explicit",
        // A note about how much is never a like or dislike.
        p_polarity: input.amount ? 0 : (input.polarity ?? 0),
        p_attributes: { ...(input.about ? { about: input.about } : {}), ...(input.amount ? { amount: input.amount } : {}) },
        p_subject_ingredient: ingredientId,
        p_subject_recipe: input.recipeId,
      });
      if (error) throw error;
      return data;
    },
    async getVoiceProfile(memberId) {
      const { data, error } = await requireSupabase()
        .from("voice_profiles")
        .select("pace, verbosity, skill_level, units_system")
        .eq("member_id", memberId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...DEFAULT_PROFILE };
      return { pace: data.pace, verbosity: data.verbosity, skill: data.skill_level, units: data.units_system } as VoiceProfile;
    },
    async updateVoiceProfile(memberId, changes) {
      const row = {
        ...(changes.pace ? { pace: changes.pace } : {}),
        ...(changes.verbosity ? { verbosity: changes.verbosity } : {}),
        ...(changes.skill ? { skill_level: changes.skill } : {}),
        ...(changes.units ? { units_system: changes.units } : {}),
      };
      const { error } = await requireSupabase().from("voice_profiles").update(row).eq("member_id", memberId);
      if (error) throw error;
    },
    async updateMemory(memoryId, statement) {
      const { error } = await requireSupabase().rpc("update_memory", { p_memory: memoryId, p_statement: statement });
      if (error) throw error;
    },
    async getNotificationSettings(householdId) {
      const { data, error } = await requireSupabase().rpc("get_notification_settings", { p_household: householdId });
      if (error) throw error;
      return fromSettings((data ?? {}) as Record<string, unknown>);
    },
    async setNotificationSettings(householdId, changes) {
      const settings = {
        ...(changes.dailyPick !== undefined ? { daily_pick: changes.dailyPick } : {}),
        ...(changes.pickTime ? { pick_time: changes.pickTime } : {}),
        ...(changes.quietStart ? { quiet_start: changes.quietStart } : {}),
        ...(changes.quietEnd ? { quiet_end: changes.quietEnd } : {}),
      };
      const { data, error } = await requireSupabase().rpc("set_notification_settings", { p_household: householdId, p_settings: settings });
      if (error) throw error;
      return fromSettings((data ?? {}) as Record<string, unknown>);
    },
    async registerDevice({ householdId, memberId, pushToken, platform, appVersion, locale }) {
      const { error } = await requireSupabase().from("devices").upsert(
        { household_id: householdId, member_id: memberId, push_token: pushToken, platform, app_version: appVersion ?? null, locale: locale ?? null, last_seen_at: new Date().toISOString() },
        { onConflict: "push_token" },
      );
      if (error) throw error;
    },
  },

  kitchen: {
    async getKitchen(householdId) {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("inventory_items")
        .select(
          "id, custom_name, quantity, unit, staple_level, state, flavor_roles, expiry_date, expiry_estimated, confidence, added_via, ingredients(canonical_name), storage_locations(kind)",
        )
        .eq("household_id", householdId)
        .eq("status", "active")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((row): PantryItem => {
        const r = row as typeof row & {
          ingredients?: { canonical_name: string } | null;
          storage_locations?: { kind: LocationKind } | null;
        };
        const key = r.ingredients?.canonical_name ?? null;
        return {
          id: r.id,
          ingredientKey: key,
          name: key ?? r.custom_name ?? "?",
          quantity: r.quantity,
          unit: r.unit,
          location: r.storage_locations?.kind ?? "pantry",
          stapleLevel: r.staple_level,
          expiryDate: r.expiry_date,
          expiryEstimated: r.expiry_estimated,
          confidence: Number(r.confidence),
          state: r.state,
          flavorRoles: (r.flavor_roles ?? []) as FlavorRole[],
          guess: r.added_via === "onboarding" && Number(r.confidence) <= 0.5,
        };
      });
    },

    async getUseSoon(householdId, days = 3) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("get_use_soon", { p_household: householdId, p_days: days });
      if (error) throw error;
      return ((data ?? []) as UseSoonRow[]).map(
        (r): PantryItem => ({
          id: r.id,
          ingredientKey: r.name,
          name: r.name,
          quantity: r.quantity,
          unit: r.unit,
          location: r.location_kind,
          stapleLevel: null,
          expiryDate: r.expiry_date,
          expiryEstimated: true,
          confidence: Number(r.confidence),
          state: "raw",
          flavorRoles: [],
        }),
      );
    },

    async parseItems({ householdId, text, languageCode }) {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke("parse-inventory", {
        body: { household_id: householdId, text, language_code: languageCode },
      });
      if (error || !data) {
        // Offline or the function is down: the on-device parser still gets most pantry sentences right.
        return { items: parsePantryText(text, catalogIndex).map(toDraft), source: "device" };
      }
      const result = data as { items: ParseInventoryItem[]; source: string };
      return {
        source: result.source,
        items: result.items.map((i) =>
          toDraft({
            said: i.name,
            ingredientKey: i.ingredient_key,
            quantity: i.quantity,
            unit: i.unit,
            locationKind: i.location_kind,
            state: i.state,
            confidence: i.confidence,
          }),
        ),
      };
    },

    async scanItems(input) {
      const sb = requireSupabase();
      const body =
        input.kind === "barcode"
          ? { household_id: input.householdId, kind: "barcode", code: input.code }
          : { household_id: input.householdId, kind: input.kind, image: input.image, media_type: input.mediaType ?? "image/jpeg" };
      const { data, error } = await sb.functions.invoke("scan-pantry", { body });
      if (error || !data) throw error ?? new Error("scan failed");
      const result = data as { items: ParseInventoryItem[]; source: string };
      return {
        source: result.source,
        items: result.items.map((i) =>
          toDraft({
            said: i.name,
            ingredientKey: i.ingredient_key,
            quantity: i.quantity,
            unit: i.unit,
            locationKind: i.location_kind,
            state: i.state,
            confidence: i.confidence,
          }),
        ),
      };
    },

    async addItems({ householdId, items, addedVia }) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("add_inventory_items", {
        p_household: householdId,
        p_items: items.map(toRpcItem),
        p_added_via: addedVia,
      });
      if (error) throw error;
      return (data ?? []) as string[];
    },

    async updateItem(itemId, c) {
      const sb = requireSupabase();
      const changes: { [key: string]: Json } = {};
      if (c.quantity !== undefined) changes.quantity = c.quantity;
      if (c.unit !== undefined) changes.unit = c.unit;
      if (c.stapleLevel !== undefined) changes.staple_level = c.stapleLevel;
      if (c.locationKind !== undefined) changes.location_kind = c.locationKind;
      if (c.expiryDate !== undefined) changes.expiry_date = c.expiryDate;
      if (c.customName !== undefined) changes.custom_name = c.customName;
      if (c.confirm) changes.confirm = true;
      const { error } = await sb.rpc("update_inventory_item", { p_item: itemId, p_changes: changes });
      if (error) throw error;
    },

    async finishItem(itemId, discarded) {
      const { error } = await requireSupabase().rpc("finish_inventory_item", { p_item: itemId, p_discarded: discarded });
      if (error) throw error;
    },

    async reopenItem(itemId) {
      const { error } = await requireSupabase().rpc("reopen_inventory_item", { p_item: itemId });
      if (error) throw error;
    },

    async guessFromRecipe(householdId, recipeId) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("guess_pantry_from_recipe", { p_household: householdId, p_recipe: recipeId });
      if (error) throw error;
      return data ?? [];
    },

    async clearGuesses(householdId, itemIds) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("clear_pantry_guesses", { p_household: householdId, p_items: itemIds });
      if (error) throw error;
      return data ?? 0;
    },

    async getList(householdId) {
      const { data, error } = await requireSupabase()
        .from("shopping_list_items")
        .select("id, display_name, quantity, unit, reason, ingredients(canonical_name)")
        .eq("household_id", householdId)
        .in("status", ["needed", "in_cart"])
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => {
        const key = (r as { ingredients?: { canonical_name: string } | null }).ingredients?.canonical_name ?? null;
        return {
          id: r.id,
          ingredientKey: key,
          name: key ?? r.display_name,
          quantity: r.quantity === null ? null : Number(r.quantity),
          unit: r.unit,
          reason: r.reason as ListLine["reason"],
        };
      });
    },
    async markBought(householdId, itemIds) {
      const { data, error } = await requireSupabase().rpc("mark_list_items_bought", { p_household: householdId, p_item_ids: itemIds });
      if (error) throw error;
      return data ?? [];
    },
    async removeFromList(itemId) {
      const { error } = await requireSupabase().rpc("remove_list_item", { p_item: itemId });
      if (error) throw error;
    },
    async addToList(householdId, items) {
      const { error } = await requireSupabase().rpc("add_to_shopping_list", {
        p_household: householdId,
        p_items: items.map((i) => ({ name: i.name, reason: i.reason })),
      });
      if (error) throw error;
    },

    subscribe(householdId, onChange) {
      const sb = requireSupabase();
      const channel = sb
        .channel(`kitchen:${householdId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "inventory_items", filter: `household_id=eq.${householdId}` },
          () => onChange(),
        )
        .subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
  },

  recipe: {
    async getPicks(input) {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke<SuggestMealsResponse>("suggest-meals", {
        body: {
          household_id: input.householdId,
          member_id: input.memberId,
          meal_slot: input.mealSlot,
          craving: input.craving,
          chips: input.chips,
          who_eating: input.whoEating,
          focus: input.focus,
          language_code: input.languageCode,
        },
      });
      if (error || !data) throw error ?? new Error("suggest-meals returned nothing");
      const picks: Pick[] = data.picks.map((p) => ({
        recommendationId: p.recommendation_id,
        recipeId: p.recipe.id,
        slug: p.recipe.slug,
        title: p.recipe.title,
        titles: p.recipe.titles ?? undefined,
        reason: p.reason_text,
        uses: p.uses,
        missing: p.missing,
        totalTimeMin: p.recipe.total_time_min,
        imageUrl: null,
        have: p.have,
        total: p.total,
        score: p.score,
      }));
      return {
        batchId: data.batch_id,
        mealSlot: data.meal_slot,
        hero: picks[0] ?? null,
        alternates: picks.slice(1),
        check: data.check ? { itemId: data.check.item_id, name: data.check.name, ifYes: data.check.if_yes, ifNo: data.check.if_no } : null,
        calendar: data.calendar
          ? {
            today: data.calendar.today,
            offerFast: data.calendar.offer_fast,
          }
          : null,
      };
    },

    async respondToPick(recommendationId, status, reason) {
      const sb = requireSupabase();
      const { error } = await sb
        .from("recommendations")
        .update({ status, dismiss_reason: reason ?? null, acted_at: new Date().toISOString() })
        .eq("id", recommendationId);
      if (error) throw error;
    },

    async adaptRecipe(input) {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke<{
        adapted_recipe_id: string | null;
        summary: string;
        changed_steps: number[];
        unresolved: string[];
      }>("adapt-recipe", {
        body: {
          household_id: input.householdId,
          recipe_id: input.recipeId,
          missing: input.missing,
          spice: input.spice,
          servings: input.servings,
          missing_equipment: input.missingEquipment,
          diet: input.diet,
          max_time_min: input.maxTimeMin,
        },
      });
      if (error || !data) throw error ?? new Error("adapt-recipe returned nothing");
      return {
        adaptedRecipeId: data.adapted_recipe_id,
        summary: data.summary,
        changedSteps: data.changed_steps,
        unresolved: data.unresolved,
      };
    },

    async getRecipe(idOrSlug) {
      const sb = requireSupabase();
      const isId = /^[0-9a-f-]{36}$/i.test(idOrSlug);
      const q = sb.from("recipes").select(RECIPE_SELECT);
      const { data, error } = await (isId ? q.eq("id", idOrSlug) : q.eq("slug", idOrSlug).is("household_id", null)).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("recipe not found");
      return recipeDocFromRow(data as unknown as RecipeRow);
    },

    async listFavourites(householdId) {
      const { data, error } = await requireSupabase()
        .from("saved_recipes")
        .select("created_at, recipes(id, slug, title, titles, course, diet, prep_time_min, cook_time_min, spice_level, tags)")
        .eq("household_id", householdId)
        .eq("collection", "favourites")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      const out: RecipeSummary[] = [];
      for (const row of data ?? []) {
        const r = (row as unknown as { recipes: { id: string; slug: string | null; title: string; titles: unknown; course: string; diet: string; prep_time_min: number | null; cook_time_min: number | null; spice_level: number; tags: string[] | null } | null }).recipes;
        if (!r || seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({
          id: r.id,
          slug: r.slug ?? r.id,
          title: r.title,
          titles: (r.titles ?? undefined) as RecipeSummary["titles"],
          course: r.course,
          diet: r.diet,
          totalTimeMin: (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0) || null,
          spiceLevel: r.spice_level,
          tags: r.tags ?? [],
        });
      }
      return out;
    },
    async setFavourite({ householdId, memberId, recipeId, on }) {
      const sb = requireSupabase();
      // Favourites belong to the household: unsaving removes it whoever saved it.
      const { error } = on
        ? await sb.from("saved_recipes").upsert(
            { household_id: householdId, member_id: memberId, recipe_id: recipeId, collection: "favourites" },
            { onConflict: "member_id,recipe_id,collection", ignoreDuplicates: true },
          )
        : await sb.from("saved_recipes").delete().eq("household_id", householdId).eq("recipe_id", recipeId).eq("collection", "favourites");
      if (error) throw error;
    },
    async getBatch(householdId, batchId) {
      const { data, error } = await requireSupabase()
        .from("recommendations")
        .select("id, rank, meal_slot, reason_text, uses_item_ids, missing, score, recipes(id, slug, title, titles, prep_time_min, cook_time_min)")
        .eq("household_id", householdId)
        .eq("batch_id", batchId)
        .order("rank");
      if (error) throw error;
      const rows = ((data ?? []) as unknown as BatchRow[]).filter((r) => r.recipes);
      if (!rows.length) return null;
      const picks: Pick[] = rows.map((r) => ({
        recommendationId: r.id,
        recipeId: r.recipes!.id,
        slug: r.recipes!.slug ?? r.recipes!.id,
        title: r.recipes!.title,
        titles: r.recipes!.titles ?? undefined,
        reason: r.reason_text,
        uses: [],
        missing: (r.missing ?? []).map((m) => m.ingredient),
        totalTimeMin: (r.recipes!.prep_time_min ?? 0) + (r.recipes!.cook_time_min ?? 0) || null,
        imageUrl: null,
        have: 0,
        total: 0,
        score: Number(r.score ?? 0),
      }));
      const batch: PickBatch = { batchId, mealSlot: rows[0]!.meal_slot, hero: picks[0] ?? null, alternates: picks.slice(1) };
      return batch;
    },
    async keepFast(householdId, eventId) {
      const sb = requireSupabase();
      const { data, error } = await sb.from("calendar_events").select("id, household_id, event_date, end_date, kind, name, regions, rules").eq("id", eventId).maybeSingle();
      if (error) throw error;
      if (!data) return;
      const row = keepFast(data as unknown as CalendarEvent, householdId);
      const { error: e2 } = await sb.from("calendar_events").insert({
        household_id: householdId,
        event_date: row.event_date,
        end_date: row.end_date ?? null,
        kind: "fast",
        name: row.name,
        regions: [],
        rules: row.rules as Json,
      });
      if (e2) throw e2;
    },
    async inventDish(householdId) {
      const { data, error } = await requireSupabase().functions.invoke<{
        recipe_id: string | null;
        reason?: "too_little" | "nothing_safe";
        title?: string;
        titles?: Record<string, string>;
        description?: string;
        uses?: string[];
      }>("invent-dish", { body: { household_id: householdId } });
      if (error) {
        // 503: no model configured; the option is hidden (11_ai_tasks_and_models.csv).
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status === 503) return { recipeId: null, reason: "unavailable" };
        throw error;
      }
      if (!data?.recipe_id) return { recipeId: null, reason: data?.reason ?? "nothing_safe" };
      return { recipeId: data.recipe_id, title: data.title ?? "", titles: data.titles ?? null, description: data.description ?? "", uses: data.uses ?? [] };
    },
    async searchRecipes(query) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("search_recipes", { p_query: query, p_limit: 20 });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        slug: r.slug ?? r.id,
        title: r.title,
        titles: (r.titles ?? undefined) as RecipeSummary["titles"],
        course: r.course,
        diet: r.diet,
        totalTimeMin: (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0) || null,
        spiceLevel: r.spice_level,
        tags: r.tags ?? [],
      }));
    },
  },
  cooking: {
    async startSession(input) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("start_cooking_session", {
        p_household: input.householdId,
        p_recipe: input.recipeId,
        p_servings: input.servings,
        p_who_eating: input.whoEating,
        p_mode: input.mode ?? "touch",
        p_recommendation: input.recommendationId,
        p_language: input.languageCode,
      });
      if (error) throw error;
      return data;
    },
    async getSession(sessionId) {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("cooking_sessions")
        .select("id, recipe_id, adapted_recipe_id, current_step, servings, who_eating, status, modifications")
        .eq("id", sessionId)
        .single();
      if (error) throw error;
      return toSession(data);
    },
    async getActiveSession(householdId) {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("cooking_sessions")
        .select("id, recipe_id, adapted_recipe_id, current_step, servings, who_eating, status, modifications")
        .eq("household_id", householdId)
        .eq("status", "active")
        .order("last_activity_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toSession(data) : null;
    },
    async advanceStep(sessionId, delta, channel = "touch") {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("advance_session_step", { p_session: sessionId, p_delta: delta, p_channel: channel });
      if (error) throw error;
      const r = data as { current_step: number; total: number };
      return { currentStep: r.current_step, total: r.total };
    },
    async ask(input) {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke<{ answer: string; safety_note: string | null; source: "rules" | "model" }>("cook-assist", {
        body: { session_id: input.sessionId, mode: "ask", text: input.question, language_code: input.languageCode },
      });
      if (error || !data) throw error ?? new Error("cook-assist returned nothing");
      return { answer: data.answer, safetyNote: data.safety_note, source: data.source };
    },
    async reportChange(input) {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke<{ reply: string; notes: StepNote[]; source: "rules" | "model" }>("cook-assist", {
        body: { session_id: input.sessionId, mode: "changed", text: input.change, language_code: input.languageCode },
      });
      if (!error && data) return data;
      // The function is unreachable: still record the change, without notes, so it isn't lost.
      const { error: e2 } = await sb.rpc("log_session_change", { p_session: input.sessionId, p_change: input.change });
      if (e2) throw e2;
      return { reply: changeReply([], localeFromLanguageCode(input.languageCode) ?? "en"), notes: [], source: "rules" };
    },
    async rescue(input) {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke<{ steps: string[]; safety_note: string | null; source: "rules" | "model" }>("rescue", {
        body: {
          session_id: input.sessionId,
          problem: input.problem,
          missing: input.missing,
          details: input.details,
          language_code: input.languageCode,
        },
      });
      if (error || !data) throw error ?? new Error("rescue returned nothing");
      return { steps: data.steps, safetyNote: data.safety_note, source: data.source };
    },
    async abandonSession(sessionId) {
      const sb = requireSupabase();
      const { error } = await sb
        .from("cooking_sessions")
        .update({ status: "abandoned", last_activity_at: new Date().toISOString() })
        .eq("id", sessionId)
        .in("status", ["active", "paused"]);
      if (error) throw error;
    },
    async completeSession(sessionId) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("complete_cooking_session", { p_session: sessionId });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        itemId: r.item_id,
        ingredient: r.ingredient,
        quantity: r.quantity === null ? null : Number(r.quantity),
        unit: r.unit,
        currentQuantity: r.current_quantity === null ? null : Number(r.current_quantity),
        staple: r.staple,
      }));
    },
    async applyDeduction(sessionId, adjustments) {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("apply_session_deduction", {
        p_session: sessionId,
        p_adjustments: adjustments.map((a) => ({
          item_id: a.itemId,
          ...(a.quantity !== undefined ? { quantity: a.quantity } : {}),
          ...(a.skip ? { skip: true } : {}),
          ...(a.stapleLevel ? { staple_level: a.stapleLevel } : {}),
        })),
      });
      if (error) throw error;
      return data ?? [];
    },
    async submitFeedback({ sessionId, rating, tags, comment, makeAgain }) {
      const sb = requireSupabase();
      const { error } = await sb.rpc("submit_feedback", {
        p_session: sessionId,
        p_rating: rating,
        p_tags: tags ?? [],
        p_comment: comment,
        p_make_again: makeAgain,
      });
      if (error) throw error;
    },
    async getStepAudio(sessionId) {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke<{ audio: { step_no: number; url: string }[] }>("session-bundle", {
        body: { session_id: sessionId },
      });
      if (error || !data) throw error ?? new Error("session-bundle returned nothing");
      return data.audio.map((a) => ({ stepNo: a.step_no, url: a.url }));
    },
  },
  voice: {
    async getToken(input) {
      const sb = requireSupabase();
      const { data, error, response } = await sb.functions.invoke<{ livekit_url: string; token: string; room_name: string; language_code: string }>(
        "voice-token",
        { body: { household_id: input.householdId, cooking_session_id: input.cookingSessionId, language_code: input.languageCode } },
      );
      if (error || !data) {
        // The function says why in the body: voice not set up on the server (503) or no consent (403).
        const reason = await (response ?? (error as { context?: Response } | null)?.context)
          ?.clone()
          .json()
          .then((b: { error?: string }) => b.error)
          .catch(() => undefined);
        if (reason === "voice_not_configured") return "not_configured";
        if (reason === "voice_consent_needed") return "consent_needed";
        throw error ?? new Error("voice-token returned nothing");
      }
      return { url: data.livekit_url, token: data.token, roomName: data.room_name, languageCode: data.language_code };
    },
  },
};

function toSession(r: {
  id: string;
  recipe_id: string;
  adapted_recipe_id: string | null;
  current_step: number;
  servings: number;
  who_eating: string[];
  status: string;
  modifications?: unknown;
}): CookSession {
  return {
    id: r.id,
    recipeId: r.adapted_recipe_id ?? r.recipe_id,
    currentStep: r.current_step,
    servings: r.servings,
    whoEating: r.who_eating ?? [],
    status: r.status as CookSession["status"],
    changes: Array.isArray(r.modifications)
      ? (r.modifications as { change?: string; notes?: StepNote[] }[])
          .filter((m) => typeof m.change === "string")
          .map((m) => ({ change: m.change!, notes: Array.isArray(m.notes) ? m.notes : [] }))
      : [],
  };
}

type SuggestMealsResponse = {
  batch_id: string;
  meal_slot: MealSlot;
  picks: {
    recommendation_id: string;
    recipe: { id: string; slug: string; title: string; titles: RecipeSummary["titles"] | null; total_time_min: number | null };
    reason_text: string;
    uses: string[];
    missing: string[];
    have: number;
    total: number;
    score: number;
  }[];
  check?: { item_id: string; name: string; if_yes: string | null; if_no: string | null } | null;
  calendar?: {
    today: { id: string | null; name: string; kind: string; kept: boolean; names: Record<string, string> | null }[];
    offer_fast: { id: string | null; name: string; names: Record<string, string> | null; note: string | null } | null;
  };
};

type BatchRow = {
  id: string;
  rank: number;
  meal_slot: MealSlot;
  reason_text: string;
  uses_item_ids: string[];
  missing: { ingredient: string }[];
  score: number | null;
  recipes: { id: string; slug: string | null; title: string; titles: RecipeSummary["titles"] | null; prep_time_min: number | null; cook_time_min: number | null } | null;
};

const fromSettings = (x: Record<string, unknown>): NotificationSettings => ({
  dailyPick: !!x.daily_pick,
  pickTime: String(x.pick_time ?? "16:00"),
  quietStart: String(x.quiet_start ?? "22:00"),
  quietEnd: String(x.quiet_end ?? "07:00"),
});
