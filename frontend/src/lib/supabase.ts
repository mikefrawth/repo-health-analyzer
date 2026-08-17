/**
 * Supabase clients, split by the privilege they carry.
 *
 * Reports are world-readable, so reads go through the anon key. Writes go
 * through the service role, which bypasses RLS — that key is the only thing
 * standing between the public and a forged Report, so it must never be reachable
 * from the browser.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "./env";

/** Read-only client. Safe anywhere: the anon key is public by design. */
export function publicClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
}

/**
 * Write-capable client. Server-only — importing this into a Client Component
 * would attempt to read a non-`NEXT_PUBLIC_` variable in the browser, where it
 * is undefined, and `requireEnv` will throw rather than silently produce a
 * client with no credentials.
 */
export function serviceRoleClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

export const REPORTS_TABLE = "reports";
