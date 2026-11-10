// Live services backed by Supabase. Features whose backend has not shipped yet throw NotImplemented,
// and the app keeps using mocks for them (see services/index.ts).
import { catalogIndex } from "@/data/catalog";
import { parsePantryText, type ParsedItem } from "@/domain/pantryParse";

import { requireSupabase } from "./supabase";
import type { Json } from "@/types/database";

import { toDraft, toRpcItem } from "./drafts";
import { RECIPE_SELECT, recipeDocFromRow, type RecipeRow } from "@/domain/recipes";

import type { FlavorRole, LocationKind, MealSlot, Member, Memory, PantryItem, Pick, RecipeSummary, Services } from "./types";

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
        .select("id, statement, source, scope, household_members(display_name)")
        .eq("household_id", householdId)
        .eq("status", "active")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(
        (m): Memory => ({
          id: m.id,
          statement: m.statement,
          source: m.source,
          scope: m.scope as Memory["scope"],
          memberName: (m as { household_members?: { display_name: string } | null }).household_members?.display_name ?? null,
        }),
      );
    },

    async forgetMemory() {
      throw new NotImplemented("forget_memory RPC (Sprint 5)");
    },
    async keepMemory() {
      throw new NotImplemented("confirm_memory RPC (Sprint 5)");
    },
  },

  kitchen: {
    async getKitchen(householdId) {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("inventory_items")
        .select(
          "id, custom_name, quantity, unit, staple_level, state, flavor_roles, expiry_date, expiry_estimated, confidence, ingredients(canonical_name), storage_locations(kind)",
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
      return { batchId: data.batch_id, mealSlot: data.meal_slot, hero: picks[0] ?? null, alternates: picks.slice(1) };
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
};

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
};
