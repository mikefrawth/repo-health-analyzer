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

export type GithubTokenScope = "public" | "repo";

export type GithubProfileRow = {
  id: string;
  github_username: string | null;
  github_token: string | null;
  github_token_scope: GithubTokenScope | null;
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
 * Ticket #20 requested no scope beyond GitHub's default at sign-in, labelled
 * explicitly as "public" (rather than left implicit) so ticket #24's
 * private-repo scope upgrade has a value to widen instead of inferring
 * history from an unlabelled token. `requestedScope` is which scope *this*
 * OAuth round trip asked for (`/auth/login`'s `scope` query param) — the
 * default keeps every existing call site (and its tests) unchanged.
 *
 * The caller is expected to have already widened `requestedScope` against
 * any previously-stored scope (see `widestScope`) — this function only
 * labels the token with whatever scope it's given, it doesn't know history.
 */
export function githubProfileRow(
  user: AuthUser,
  providerToken: string | null,
  requestedScope: GithubTokenScope = "public",
): GithubProfileRow {
  return {
    id: user.id,
    github_username: githubUsername(user),
    github_token: providerToken,
    github_token_scope: providerToken ? requestedScope : null,
  };
}

/**
 * GitHub OAuth grants are cumulative per user+app: a token issued from a
 * login that only asked for the default scope can still carry `"repo"` if
 * that scope was granted on an earlier round trip. Without this, a routine
 * re-login (session expiry, signing out and back in) would overwrite a
 * previously-granted `"repo"` scope with `"public"` in our own record —
 * `githubProfileRow` would then honestly believe the user needs to grant
 * private-repo access again, when GitHub already remembers they did.
 */
export function widestScope(
  a: GithubTokenScope | null,
  b: GithubTokenScope | null,
): GithubTokenScope | null {
  if (a === "repo" || b === "repo") return "repo";
  return a ?? b;
}
