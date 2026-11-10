import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Publishable key only. Safe because every table has row-level security (NFR-12).
 * Sessions persist in expo-sqlite's localStorage so anonymous users keep their kitchen across restarts.
 */
export const supabase =
  url && key
    ? createClient<Database>(url, key, {
        auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      })
    : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY");
  }
  return supabase;
}
