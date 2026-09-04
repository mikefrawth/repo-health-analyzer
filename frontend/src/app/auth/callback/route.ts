/**
 * Where GitHub sends the visitor back after OAuth. Exchanges the code for a
 * session (this is what actually sets the session cookie), then captures the
 * GitHub identity Supabase itself won't retain — see `lib/user-profile.ts`.
 */

import { NextResponse } from "next/server";

import { githubProfileRow, widestScope, type GithubTokenScope } from "@/lib/user-profile";
import { serverClient } from "@/lib/supabase-server";
import { fetchStoredGithubTokenScope, saveGithubProfile } from "@/lib/user-profiles-repo";

export async function GET(request: Request): Promise<NextResponse> {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = serverClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error("[auth/callback] could not exchange code for a session:", error);
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  // Which scope `/auth/login` actually asked GitHub for on this round trip
  // (issue #24) — round-tripped through the callback URL's own query string,
  // since Supabase's session doesn't otherwise expose it. Widened against
  // whatever scope was already on file, rather than written as-is: GitHub
  // OAuth grants are cumulative per user+app, so a routine re-login that
  // only asks for the default scope must not erase a "repo" scope this user
  // already granted on an earlier round trip (see `widestScope`).
  const requestedScope: GithubTokenScope =
    searchParams.get("scope") === "private" ? "repo" : "public";
  let scope: GithubTokenScope = requestedScope;
  try {
    const stored = await fetchStoredGithubTokenScope(data.session.user.id);
    scope = widestScope(stored, requestedScope) ?? requestedScope;
  } catch (readError) {
    console.error("[auth/callback] could not read the previously-stored token scope:", readError);
  }

  const profile = githubProfileRow(data.session.user, data.session.provider_token ?? null, scope);
  try {
    await saveGithubProfile(profile);
  } catch (upsertError) {
    // The session cookie is already set at this point, so the visitor is
    // still logged in — only the stored GitHub token/username is stale.
    // Logging in must not fail just because this write did.
    console.error("[auth/callback] could not save the GitHub profile:", upsertError);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/** Only ever redirect back into this app, never to an attacker-chosen host. */
function sanitizeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
