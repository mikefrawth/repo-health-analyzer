/**
 * Starts GitHub OAuth. Requests no scope beyond GitHub's default (public
 * profile + public repos) unless `?scope=private` is given — issue #24's
 * progressive-scope upgrade, triggered only when a signed-in user actually
 * tries to analyze a repo their current token can't see.
 */

import { NextResponse } from "next/server";

import { serverClient } from "@/lib/supabase-server";

/** GitHub's OAuth scope that grants read access to private repositories. */
const GITHUB_PRIVATE_REPO_SCOPE = "repo";

export async function GET(request: Request): Promise<NextResponse> {
  const { origin, searchParams } = new URL(request.url);
  const next = sanitizeNext(searchParams.get("next"));
  const wantsPrivateScope = searchParams.get("scope") === "private";
  const supabase = serverClient();

  // `next` and `scope` ride through as query params on the callback URL
  // itself — GitHub returns the caller to exactly this URL, so `/auth/
  // callback` can read back both what page to return to and which scope was
  // actually requested (to label the stored token correctly).
  const redirectTo = new URL("/auth/callback", origin);
  redirectTo.searchParams.set("next", next);
  if (wantsPrivateScope) {
    redirectTo.searchParams.set("scope", "private");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: redirectTo.toString(),
      ...(wantsPrivateScope ? { scopes: GITHUB_PRIVATE_REPO_SCOPE } : {}),
    },
  });

  if (error || !data.url) {
    console.error("[auth/login] could not start GitHub OAuth:", error);
    return NextResponse.redirect(`${origin}/?auth_error=login_failed`);
  }

  return NextResponse.redirect(data.url);
}

/** Only ever redirect back into this app, never to an attacker-chosen host. */
function sanitizeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
