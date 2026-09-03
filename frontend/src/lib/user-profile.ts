/**
 * Deriving the row we store for a signed-in user from what Supabase Auth's
 * GitHub OAuth exchange hands back.
 *
 * Supabase persists the session but not the GitHub provider token beyond the
 * initial sign-in response, so the callback route captures it here and writes
 * it to `user_profiles` — the only place it lives afterward.
 */

/** The subset of Supabase's `User` this module actually reads. */
export type AuthUser = {
  id: string;
  user_metadata: Record<string, unknown>;
};

export type GithubProfileRow = {
  id: string;
  github_username: string | null;
  github_token: string | null;
  github_token_scope: string | null;
};

/**
 * GitHub's Supabase provider populates `user_name`; `preferred_username` is a
 * generic OIDC fallback some provider versions have used instead.
 */
export function githubUsername(user: AuthUser): string | null {
  const candidate = user.user_metadata.user_name ?? user.user_metadata.preferred_username;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/**
 * Ticket #20 requests no scope beyond GitHub's default, so a token present at
 * all means "public" — labelled explicitly (rather than left implicit) so a
 * later ticket requesting the private-repo scope has a value to widen instead
 * of inferring history from an unlabelled token.
 */
export function githubProfileRow(
  user: AuthUser,
  providerToken: string | null,
): GithubProfileRow {
  return {
    id: user.id,
    github_username: githubUsername(user),
    github_token: providerToken,
    github_token_scope: providerToken ? "public" : null,
  };
}
