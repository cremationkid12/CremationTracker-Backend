import { createClient, type User } from "@supabase/supabase-js";

/** Validates a Supabase access token and returns the user, or null. */
export async function getUserFromSupabaseAccessToken(accessToken: string): Promise<User | null> {
  const url = process.env.SUPABASE_URL?.trim();
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;

  const supabase = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim());
}

/** True when Supabase keys are set and local auth is not forced for development. */
export function useSupabaseAuth(): boolean {
  if (process.env.FORCE_LOCAL_AUTH === "true") return false;
  return isSupabaseAuthConfigured();
}
