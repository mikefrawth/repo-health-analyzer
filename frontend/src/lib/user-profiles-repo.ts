/**
 * Reading and writing a signed-in user's GitHub profile.
 *
 * Mirrors reports-repo.ts's split: this table holds an OAuth token, so the
 * only write path is the service role, used exclusively by /auth/callback.
 * Reads go through the session-aware client instead — RLS's owner-only
 * `select` policy (migration 0004) means that client only ever sees the
 * caller's own row, which is exactly the "whose token am I using" question
 * issue #24's /api/analyze needs answered.
 */

import { serverClient } from "./supabase-server";
import { serviceRoleClient } from "./supabase";
import type { GithubProfileRow } from "./user-profile";

export const USER_PROFILES_TABLE = "user_profiles";

export async function saveGithubProfile(profile: GithubProfileRow): Promise<void> {
  const { error } = await serviceRoleClient()
    .from(USER_PROFILES_TABLE)
    .upsert({ ...profile, updated_at: new Date().toISOString() });

  if (error) {
    throw new Error(`Could not save GitHub profile: ${error.message}`);
  }
}

/** The signed-in caller's own stored GitHub token/scope, or `null` if
 * they've never completed the OAuth exchange (no row yet). */
export async function fetchGithubProfile(userId: string): Promise<GithubProfileRow | null> {
  const { data, error } = await serverClient()
    .from(USER_PROFILES_TABLE)
    .select("id, github_username, github_token, github_token_scope")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load GitHub profile: ${error.message}`);
  }
  return (data as GithubProfileRow | null) ?? null;
}
