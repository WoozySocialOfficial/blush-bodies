import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

// Supabase removes the callback fragment as soon as it validates the session.
let initialWebAuthUrl =
  supabaseConfigured && Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.href
    : undefined;

export const takeInitialWebAuthUrl = () => {
  const url = initialWebAuthUrl;
  initialWebAuthUrl = undefined;
  return url;
};

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
      },
    })
  : null;

export const requireSupabase = (): SupabaseClient => {
  if (!supabase)
    throw new Error(
      "Supabase is not configured. Add the Expo public URL and publishable key.",
    );
  return supabase;
};
