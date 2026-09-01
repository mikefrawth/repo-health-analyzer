-- User Profiles: the per-user GitHub identity Supabase Auth won't persist on
-- its own. Supabase's session carries the GitHub provider token only in the
-- initial sign-in response, not on later requests, so anything that needs to
-- act as the user afterward (a future ticket's private-repo fetch, #24) needs
-- it captured and stored somewhere durable. This table is that somewhere.
--
-- `github_token_scope` records what OAuth scope the stored token actually
-- carries ("public" as of ticket #20, since no extra scope is requested at
-- sign-in) so a later progressive-consent step can tell whether the stored
-- token already covers a private repo before trusting it, without re-deriving
-- that from GitHub on every request.
--
-- One row per Supabase Auth user; `id` is both the primary key and the
-- foreign key into `auth.users`.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  github_username text,
  github_token text,
  github_token_scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- Mirrors the `reports` table's split: only the service-role key (used
-- exclusively by the OAuth callback route, server-side) may write a profile,
-- so RLS grants no insert/update policy to any other role. A user may read
-- only their own row — this table holds an OAuth token, not public data.
create policy "Users can read their own profile"
  on public.user_profiles for select
  using (auth.uid() = id);
