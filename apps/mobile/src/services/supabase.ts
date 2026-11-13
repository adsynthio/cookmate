import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { secureSessionStorage } from "./secureChunks";

import type { Database } from "@/types/database";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Publishable key only. Safe because every table has row-level security (NFR-12).
 * Sessions persist so anonymous users keep their kitchen across restarts. On a phone they live in the encrypted
 * keychain / keystore (SecureStore, split into chunks; security review finding 26); a session an older build kept
 * in plain storage is moved over on first launch. The web preview has no SecureStore and keeps localStorage.
 */
const storage =
  Platform.OS === "web"
    ? localStorage
    : secureSessionStorage(
        {
          get: (k) => SecureStore.getItemAsync(k),
          set: (k, v) => SecureStore.setItemAsync(k, v),
          del: (k) => SecureStore.deleteItemAsync(k),
        },
        localStorage,
      );

export const supabase =
  url && key
    ? createClient<Database>(url, key, {
        auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      })
    : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY");
  }
  return supabase;
}
