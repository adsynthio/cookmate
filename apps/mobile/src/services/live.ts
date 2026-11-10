// Live services backed by Supabase. Features whose backend has not shipped yet throw NotImplemented,
// and the app keeps using mocks for them (see services/index.ts).
import { catalogIndex } from "@/data/catalog";
import { parsePantryText, type ParsedItem } from "@/domain/pantryParse";

import { requireSupabase } from "./supabase";
import type { Json } from "@/types/database";

import { toDraft, toRpcItem } from "./drafts";
import type { FlavorRole, LocationKind, Memory, PantryItem, Services } from "./types";

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
    async getPicks() {
      throw new NotImplemented("suggest-meals Edge Function (Sprint 3)");
    },
  },
};
