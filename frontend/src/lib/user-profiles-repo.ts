/**
 * Writing a signed-in user's GitHub profile.
 *
 * Mirrors reports-repo.ts's split: this table holds an OAuth token, so the
 * only write path is the service role, used exclusively by /auth/callback.
 */

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
