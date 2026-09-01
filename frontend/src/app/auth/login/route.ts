/**
 * Starts GitHub OAuth. Requests no scope beyond GitHub's default (public
 * profile + public repos) — a later ticket adds a separate upgrade step for
 * the private-repo scope, triggered only when a user needs it.
 */

import { NextResponse } from "next/server";

import { serverClient } from "@/lib/supabase-server";

export async function GET(request: Request): Promise<NextResponse> {
  const { origin } = new URL(request.url);
  const supabase = serverClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    console.error("[auth/login] could not start GitHub OAuth:", error);
    return NextResponse.redirect(`${origin}/?auth_error=login_failed`);
  }

  return NextResponse.redirect(data.url);
}
