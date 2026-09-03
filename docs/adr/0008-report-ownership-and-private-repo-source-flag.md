# Report ownership defaults to private, enforced by a database check constraint tied to source-repo visibility

Issue #22 (part of the accounts/subscriptions epic, #19) needed a way for a signed-in user's Reports to stay private by default while anonymous Reports kept today's always-public behaviour, plus a hard guarantee — provable independent of application code — that a Report sourced from a private repository can never be exposed.

## Decision

`reports` gains three columns (`frontend/supabase/migrations/0005_add_report_ownership.sql`): a nullable `owner_id` (references `auth.users(id)`, `on delete set null` so a deleted account doesn't cascade-delete its Reports), `is_public` (defaults `true`, matching the pre-#22 always-public behaviour, but written explicitly per-insert by application code — `false` when `owner_id` is set, `true` when it's `null`), and `source_repo_was_private` (recorded once, at generation time, from the GitHub API's own `private` field — the backend's `AnalyzeResponse.private`, `backend/app/models.py`).

A check constraint, `reports_private_source_not_public`, makes `source_repo_was_private` and `is_public` mutually exclusive at the row level. Because it's a plain check constraint rather than a trigger, it fires on every `INSERT` and `UPDATE` — the exact two places a violation could otherwise sneak in — without needing separate trigger logic for each.

RLS's `SELECT` policy changes from "always true" to "public, or the requester is the owner" (`is_public or auth.uid() = owner_id`). A new `UPDATE` policy lets an owner flip their own Report's `is_public` — the app's one non-service-role write — so the "owner only" rule is enforced by Postgres itself, independent of `frontend/src/lib/reports-repo.ts`'s `makeReportPublic()` getting it right. The check constraint applies to this path too: an owner attempting to publish a private-repo-sourced Report gets a `23514` (check-violation) error, not a silent no-op — `reports-repo.ts` treats that error code the same as "not the owner" (both mean "can't be made public"), since the caller doesn't need to distinguish the two.

`fetchReport()` switches from the anon-key `publicClient()` to the cookie-aware `serverClient()` (ADR-0007), since only that client resolves `auth.uid()` for the visitor making the request — without it, an owner could never see their own private Report through this code path. `fetchRecentReports()` (the homepage list) stays on `publicClient()` deliberately: RLS naturally narrows it to public Reports for every visitor, anonymous or not, which is the desired behaviour — the homepage isn't a personalized "my reports" view.

`canBeMadePublic()` (`frontend/src/lib/report.ts`) is a pure function that only decides whether to *render* the "make public" toggle; it carries no authority. The actual guarantee is the database constraint, proven by a new integration test.

**First integration test, first CI job needing infrastructure beyond a language runtime.** `frontend/tests/integration/report-visibility.integration.test.ts` stands up three real Supabase JS clients — one authenticated as a Report's owner, one as a different signed-in user, one anonymous — against a local Postgres/GoTrue stack (`supabase start`, via the Supabase CLI) and exercises the actual RLS policy and constraint, not a mock. It's excluded from the default `npm test` run (`vitest.config.ts`'s `exclude`) and lives behind its own `vitest.integration.config.ts` and `npm run test:integration`, since it needs Docker and a running stack that the rest of the suite doesn't. The new `db` job in `.github/workflows/ci.yml` installs the Supabase CLI, runs `supabase start` (which also applies every migration in `frontend/supabase/migrations/`), feeds `supabase status -o env`'s output to the test run, and tears the stack down afterward.

## Alternatives considered

**A trigger instead of a check constraint.** Rejected as unnecessary: both columns being compared live on the same row, which is exactly what a check constraint is for. A trigger would only be needed if the rule depended on data outside the row being written (e.g. a join), which this doesn't.

**Enforce "owner only" and "never public from private" purely in application code, service-role writes only.** Rejected — this is the one guarantee in the whole ticket the product owner explicitly wants provable at the database layer, immune to a future application-code bug. Adding a real RLS `UPDATE` policy (rather than routing the toggle through the service role) is what makes "provable" true instead of merely "app code currently gets it right."

**Run the integration test through the Next.js API routes rather than direct Supabase clients.** Rejected: the property under test is "what can a given Postgres role actually read and write," not "does this particular route handler call the right function." Talking to Postgres directly through real JWTs is a shorter, more direct path to that proof, and doesn't require running the Next.js server in CI.

## Consequences

- Every future write to `reports` needs to know whether it's a service-role write (bypasses RLS entirely, must set all three new columns correctly by hand) or a session-aware write (subject to RLS, currently only the visibility toggle). `#24` (private-repo analysis) and `#25` (credit-gated reports) both insert or reason about these columns and should follow the same explicit-value convention `reports-repo.ts` already uses, rather than relying on column defaults.
- The CI job introduces Docker as a build dependency for the first time in this repo, and takes noticeably longer than the other two jobs (image pulls, database boot). Acceptable for now since it only runs on push/PR, same triggers as the existing jobs; would need reconsidering (e.g. a persisted/cached Supabase image layer) if CI latency becomes a problem.
- `frontend/supabase/config.toml` (generated by `supabase init`) is now committed — it's the Supabase CLI's project configuration (ports, service versions), not environment-specific secrets, and needs to exist for `supabase start` to run at all, locally or in CI.
