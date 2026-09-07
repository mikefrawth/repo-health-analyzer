/**
 * The session-aware Supabase client, factored out from where its cookies
 * come from.
 *
 * `supabase-server.ts` and `middleware.ts` each build this same client —
 * same `createServerClient` call, same credentials — differing only in how
 * they read and write cookies (a Server Component can't write them at all;
 * middleware has to rebuild its `NextResponse` around each write). Isolated
 * here with no `next/headers` import, so middleware (which runs on the Edge
 * runtime) can use it too.
 */

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseSessionCredentials } from "./env";

export function sessionClient(cookies: CookieMethodsServer): SupabaseClient {
  return createServerClient(...supabaseSessionCredentials(), { cookies });
}
