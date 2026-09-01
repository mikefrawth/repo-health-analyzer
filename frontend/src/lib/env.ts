/**
 * Environment access with failures that say what's missing.
 *
 * A missing variable surfaces here, named, rather than as an opaque error from
 * whichever client tried to use it.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `See frontend/.env.example for the full list.`,
    );
  }
  return value;
}

/** The (url, anon key) pair every session-aware Supabase client needs. */
export function supabaseSessionCredentials(): [url: string, anonKey: string] {
  return [requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")];
}
