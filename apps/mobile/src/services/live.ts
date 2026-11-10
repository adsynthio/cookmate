// Live services backed by Supabase. Features whose backend has not shipped yet throw NotImplemented,
// and the app keeps using mocks for them (see services/index.ts).
import { useSoon } from "@/domain/pantry";

import { requireSupabase } from "./supabase";
import type { LocationKind, Memory, PantryItem, Services } from "./types";

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
        .select("id, custom_name, quantity, unit, staple_level, expiry_date, expiry_estimated, confidence, ingredients(canonical_name), storage_locations(kind)")
        .eq("household_id", householdId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []).map((row): PantryItem => {
        const r = row as typeof row & {
          ingredients?: { canonical_name: string } | null;
          storage_locations?: { kind: LocationKind } | null;
        };
        return {
          id: r.id,
          name: r.ingredients?.canonical_name ?? r.custom_name ?? "?",
          quantity: r.quantity,
          unit: r.unit,
          location: r.storage_locations?.kind ?? "pantry",
          stapleLevel: r.staple_level,
          expiryDate: r.expiry_date,
          expiryEstimated: r.expiry_estimated,
          confidence: Number(r.confidence),
        };
      });
    },
    async getUseSoon(householdId, days = 3) {
      return useSoon(await liveServices.kitchen.getKitchen(householdId), days);
    },
  },

  recipe: {
    async getPicks() {
      throw new NotImplemented("suggest-meals Edge Function (Sprint 3)");
    },
  },
};
