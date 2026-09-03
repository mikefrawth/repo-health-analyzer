# Per-user identity is Supabase Auth's GitHub OAuth, with the provider token captured into a new `user_profiles` table

Issue #20 (part of the accounts/subscriptions epic, #19) needed to introduce the app's first notion of per-user identity — until now the only auth in the app was the `X-Internal-Secret` header proving a request came from the frontend, which authenticates the caller, not a person.

## Decision

Use Supabase Auth's GitHub OAuth provider, wired into the Next.js App Router via `@supabase/ssr` (`createServerClient` in `frontend/src/lib/supabase-server.ts`, cookie refresh in `frontend/src/middleware.ts`). This is additive to the existing `frontend/src/lib/supabase.ts` clients: `publicClient()`/`serviceRoleClient()` remain unauthenticated database clients scoped to the `reports` table; the new `serverClient()` is the only one that resolves a request to a signed-in user.

Initial login (`/auth/login`) requests no OAuth scope beyond GitHub's default (public profile, public repos) — matching the ticket's requirement that the private-repo scope be requested later, and only when a user actually needs it.

Supabase's session keeps the GitHub provider's access token only in the response to the initial sign-in exchange; it isn't retained on later `getUser()`/`getSession()` calls. Since a later ticket (#24, private-repo access) needs that token to make GitHub API calls on the user's behalf, `/auth/callback` (`frontend/src/app/auth/callback/route.ts`) captures it at exchange time and writes it into a new table, `user_profiles` (`frontend/supabase/migrations/0004_create_user_profiles.sql`) — one row per Supabase Auth user, holding `github_username`, `github_token`, and `github_token_scope`. The last field is written literally as `"public"` today (see `frontend/src/lib/user-profile.ts`), a deliberate label rather than an inferred value, so #24 can tell "this token's scope is known and insufficient" from "this token's scope was never recorded" without re-deriving it from GitHub.

Row-level security on `user_profiles` mirrors the `reports` table's existing pattern: a user may `select` only their own row (`auth.uid() = id`); no `insert`/`update` policy is granted to any client role, so only the service-role client — used exclusively by the callback route, server-side — can write one. A token belongs to no one but its owner and the server.

## Alternatives considered

**Store the provider token only in the Supabase session/JWT, no separate table.** Rejected: Supabase does not refresh or re-expose the provider token on subsequent requests, so anything past the initial callback would have no token to use — this doesn't survive to the point where #24 needs it.

**A dedicated `auth`-prefixed schema or Supabase Vault for the token instead of a plain table column.** Deferred as unnecessary for v1: `user_profiles` already sits behind RLS with no non-owner read policy, and the service-role key already has unrestricted database access in this app's threat model (see `reports`'s service-role write path) — introducing a separate secrets store would be new infrastructure for a guarantee RLS already provides here.

## Consequences

- Every future ticket that needs "who is this visitor" reads it via `serverClient().auth.getUser()`; every future ticket that needs "what's their GitHub token" reads `user_profiles`, not the session.
- `middleware.ts` is new: every request now round-trips through a Supabase session-refresh check. Acceptable latency cost for a first-party UI; would need reconsidering if this backend logic needs to scale to a much higher request volume.
- A GitHub OAuth App and the corresponding Supabase Auth provider configuration (client ID/secret) are external, dashboard-only setup this ADR does not cover — required before login works in any environment, tracked as an operational prerequisite rather than a code change.
