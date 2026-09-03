/**
 * Refreshes the Supabase session cookie on every request.
 *
 * Server Components can't write cookies (see `supabase-server.ts`), so the
 * session's access token would silently go stale without this: middleware
 * runs ahead of them and is where the refreshed cookie actually gets set.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseSessionCredentials } from "./lib/env";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    ...supabaseSessionCredentials(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touches the session so an expired access token gets refreshed and the new
  // cookie is written above before the request reaches a Server Component.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Every path except static assets and Next's internals — no route in
    // this app needs a stale session.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
