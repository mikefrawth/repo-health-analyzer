/**
 * Session-aware Supabase client for Server Components and Route Handlers.
 *
 * Unlike `publicClient()`/`serviceRoleClient()` in `./supabase.ts`, this
 * client reads the visitor's own auth cookies, so `auth.getUser()` answers
 * "who is this visitor" rather than acting as an anonymous or service caller.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { supabaseSessionCredentials } from "./env";

export function serverClient(): SupabaseClient {
  const cookieStore = cookies();

  return createServerClient(
    ...supabaseSessionCredentials(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, which can't write cookies — the
            // session still refreshes because `middleware.ts` runs first on
            // every request and writes the cookie there instead.
          }
        },
      },
    },
  );
}

/** The signed-in visitor making this request, or `null` if there isn't one. */
export async function currentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await serverClient().auth.getUser();
  return user;
}
