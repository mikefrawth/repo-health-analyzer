---
status: implemented
ready-for-agent: true
---

# Analyze a public GitHub repository and return a Report

## Problem Statement

A developer wants a quick, trustworthy read on the health of a public GitHub repository — their own, before publishing it, or someone else's, before depending on it — without cloning it locally and running a dozen tools by hand. They want a single number they can trust is reproducible, backed by the specific measurements that produced it, plus a plain-language read on what those measurements mean.

A number that can silently drift between identical runs isn't trustworthy. A number that rewards a repository for being hard to inspect (no dependency manifest, no supported language analyzer) isn't trustworthy either — and this second failure mode was not obvious from the formula's description; it was only found by driving the formula through real repository shapes by hand.

## Solution

A backend endpoint, `POST /analyze`, that takes a public GitHub repository URL and returns a Report: a deterministic 0–100 Health Score, the objective Metrics it was computed from, an Analysis Scope disclosure, and an AI-generated qualitative summary (Strengths, Risks, Suggestions). The Health Score is a pure function of Metrics — the AI Summary never influences it, so the same Metrics always yield the same Health Score. If the summary step fails, the Report is still returned with the Metrics and Health Score intact (a Partial Report) rather than failing the whole request.

## User Stories

1. As a developer, I want to submit a public GitHub repo URL and get back a Health Score, so that I have one trustworthy number to anchor a quick judgment.
2. As a developer, I want the Health Score to be reproducible, so that re-running the analysis on an unchanged repository gives me the same number.
3. As a developer, I want to see the underlying Metrics (tests, CI, README, commit recency, dependency count, complexity), so that I can judge for myself whether the score's inputs make sense.
4. As a developer, I want a repository that's genuinely inactive to score noticeably lower on activity, so that a rich commit history from years ago doesn't disguise abandonment.
5. As a developer, I want a repository we couldn't fully measure (no manifest, no supported complexity analyzer) to be capped below a perfect score, so that "we couldn't check" is never indistinguishable from "we checked and it's flawless."
6. As a developer, I want an unsupported language to not be penalized as a failure, so that a well-maintained Go or Rust repository isn't unfairly marked down just because we lack a complexity analyzer for it.
7. As a developer, I want a plain-language summary of strengths, risks, and suggested improvements, so that I don't have to interpret the raw metrics myself.
8. As a developer, I want the summary to still show up even if the AI call fails, along with a clear "unavailable" state, rather than losing the whole analysis, so that a flaky third-party call doesn't waste the work already done.
9. As a developer, I want an invalid or non-GitHub URL rejected with a clear message, so that I know immediately my input was the problem, not the analysis.
10. As a developer, I want a private or nonexistent repository to fail with a specific, readable explanation, so that I'm not left guessing why nothing came back.
11. As a developer, I want an oversized repository rejected before the backend spends time cloning it, so that the service stays responsive under abuse or accidental misuse.
12. As an operator of this service, I want the `/analyze` endpoint gated behind a shared secret, so that the Claude API bill can't be run up by anyone who finds the backend's URL directly.
13. As a developer, I want the Analysis Scope disclosed in the Report (how many files were seen vs. analyzed, whether truncation happened), so that I know whether a large repository was fully inspected or sampled.
14. As a developer submitting a very large repository, I want it truncated to a bounded Analysis Scope rather than timing out or crashing the backend, so that I still get a usable Report.
15. As a developer, I want the file-truncation strategy to keep root-level files over deeply-nested ones, so that the files most likely to matter (entry points, top-level config) are the ones actually analyzed.
16. As a Python-repository author, I want my repository's maintainability measured via `radon`, so that the Complexity Signal reflects an established, language-appropriate metric.
17. As a JS/TS-repository author, I want my repository's complexity measured via a pinned ESLint `complexity` rule, so that the signal doesn't depend on installing my own project's dependencies or trusting my own lint config.
18. As a developer, I want dependency count treated as "unmeasurable" rather than "zero" when no manifest is found, so that a repository with a manifest we don't parse isn't penalized as having no dependencies.
19. As a developer, I want the commit-recency and commit-activity measurements to be distinct (how long ago vs. how much has happened lately), so that "one commit yesterday after two years of silence" and "steady weekly commits" don't get conflated into the same score.
20. As a maintainer of this codebase, I want the Health Score formula covered by tests that pin its behavior with independently-derived expected values (not the formula recomputing itself), so that a future change to the weights or curves is caught rather than silently accepted.
21. As a maintainer of this codebase, I want the formula's real-world behavior validated by hand — not just unit-tested — before trusting it, so that defects invisible to unit tests (like a renormalization loophole) are caught before they reach a shipped score.

## Implementation Decisions

- **Endpoint**: `POST /analyze`, request body `{repo_url: string}`, gated by a required `X-Internal-Secret` header checked via constant-time comparison against `INTERNAL_API_SECRET`. Missing or mismatched secret → `401`. This is caller authentication (Next.js frontend → this backend), not end-user authentication — see [ADR-0002](../adr/0002-backend-owns-github-fetch-via-clone.md).
- **Orchestration sequence** (all in the `analyze` module): parse and validate the URL → fetch GitHub repo metadata → reject if over the size limit → clone (bounded depth) → resolve the Analysis Scope → compute Metrics → compute the Health Score → attempt the AI Summary → return the Report. A URL that doesn't match `github.com/{owner}/{repo}` is rejected before any network call.
- **AnalyzeResponse shape**: `repo_url`, `metrics` (Metrics), `health_score` (int, 0–100), `analysis_scope` (AnalysisScope), `ai_summary` (AISummary or `null`). A `null` `ai_summary` is a valid, complete response — a Partial Report, not an error — returned with HTTP `200`.
- **Health Score is a pure function of Metrics**, `health_score(metrics) -> int`, with no dependency on the AI Summary, network state, or anything outside its argument. Per-component scores are 0.0–1.0, each with a fixed integer weight (tests 20, CI 15, README 15, commit recency 12, commit activity 8, dependency hygiene 10, complexity 20 — summing to 100). A component that cannot be measured for a given repository is dropped from both the numerator and the weight total (renormalization), so an unmeasurable component is score-neutral rather than a penalty.
- **Confidence cap** ([ADR-0003](../adr/0003-health-score-activity-window-and-confidence-cap.md)): renormalization alone allowed a repository with several dropped components to still reach 100. The final score is `min(renormalized_weighted_average, confidence_cap(measured_weight))`, where `confidence_cap` withholds half a point of ceiling per point of unmeasured weight (`100 - unmeasured_weight * 0.5`). A fully-measured repository can still reach 100; a repository missing 30 points of weight is capped at 85 regardless of how well it scores on what could be measured. The cap only ever lowers a score, never raises one.
- **Commit activity uses a trailing window, not clone-wide history** ([ADR-0003](../adr/0003-health-score-activity-window-and-confidence-cap.md)): `count_recent_commits(timestamps, now, window_days=90)` counts only commits within the trailing 90-day window from the clone's commit log, replacing a prior implementation that counted every commit present in the shallow clone regardless of age. Commit recency (days since the single most recent commit) is a separate, unchanged measurement — the two together are meant to distinguish "when did work last happen" from "how much has happened lately," and conflating them was the original defect.
- **Dependency count is `int | None`**, never coerced to `0` when no manifest is found. Manifests currently parsed: `package.json` (`dependencies` + `devDependencies`), `requirements.txt` (non-comment, non-blank lines), `pyproject.toml` (PEP 621 `project.dependencies` and Poetry's `tool.poetry.dependencies`). Counts sum across every manifest present. A malformed manifest is treated as absent for that file, not a fatal error.
- **Analysis Scope resolution**: walk the clone, drop a fixed ignore list (`.git`, `node_modules`, `dist`, `build`, `vendor`, `__pycache__`, `.venv`, `target`, `.next`, `coverage`, plus common cache directories) — not the analyzed repository's own `.gitignore` — then truncate to a file cap, ordered breadth-first by path depth (shallow files first) when the repository exceeds it. `AnalysisScope` in the Report reports `total_files_seen`, `files_analyzed`, `truncated`, and separate `python_files_analyzed` / `js_files_analyzed` counts, since those have their own, smaller caps for complexity analysis.
- **Language detection for the Complexity Signal**: derived from `language_breakdown`, but `primary_code_language` explicitly excludes non-code languages (Markdown, JSON, YAML, HTML, CSS) so a documentation-heavy repository isn't misclassified by file count.
- **Complexity Signal is per-repository, single-language**: whichever of Python or JS/TS is the repository's primary code language gets one `ComplexitySignal` (`kind: "maintainability"` via `radon.metrics.mi_visit`, or `kind: "avg_cyclomatic"` via a pinned ESLint install running only the `complexity` rule against a minimal inline config — never the analyzed repository's own ESLint config or dependencies). Repositories in unsupported languages simply have no Complexity Signal; this is the primary way the confidence cap engages in practice.
- **GitHub fetch and clone**: repo metadata (including `size` in KB) is fetched from the GitHub REST API first and checked against a size limit before any clone is attempted; the clone itself is `git clone --depth N` (default 50) into a temp directory that is removed afterward, using `os.chmod`-based forced removal to handle git's read-only objects on Windows.
- **AI Summary generation**: `generate_summary(repo_url, metrics, health_score, scope, settings)` calls the Anthropic Messages API (`client.messages.parse`, structured output against the `AISummary` schema) with a system prompt that explicitly instructs the model not to revise or restate the already-computed score. On any `anthropic.APIError`/`APIConnectionError`, a `stop_reason == "refusal"`, an unparseable response, or a missing API key, the function returns `None` rather than raising — the caller (the orchestration sequence) treats `None` as "no AI Summary" and still returns the rest of the Report.
- **Error surface**: a small `AnalysisError(message, status_code)` exception type, caught by a FastAPI exception handler and rendered as `{"detail": message}` with the given status code. Used for: bad URL shape (400), repo not found or private (404), GitHub rate-limited (429), oversized repo (413), clone failure or timeout (502/504).

## Testing Decisions

Tests only exercise behavior through public seams — never internal call sequences or private helpers directly, except where a helper's own contract (e.g. a specific heuristic or the size guard) is itself the thing worth pinning independently of the endpoint.

**Primary seam — `POST /analyze`, via FastAPI `TestClient`** (`backend/tests/test_api.py`). GitHub fetch and clone are stubbed at the `analyzer` module's function references (`fetch_repo_metadata`, `_measure_clone`), keeping the real orchestration, scoring, and AI Summary handling in the loop. Covers:
  - The shared-secret gate rejects missing/wrong secrets with `401`, and `/health` needs no secret.
  - A `None` AI Summary still yields a `200` Report with correct `metrics` and `health_score`.
  - A successful AI Summary is returned unchanged alongside a `health_score` unaffected by its content.
  - An invalid URL is rejected with `400` and a message naming `github.com`.

  Each new behavior added to this seam was verified by a mutation probe — a deliberate one-line break of the behavior under test, confirming the relevant test (and no other) fails, then reverting — rather than trusted on first green, since the implementation predated the test in this build pass.

**Second seam — `health_score(metrics)`, pure function** (`backend/tests/test_scoring.py`). This is where the formula's invariants are pinned precisely: weights sum to 100; a fully-measured "perfect" repository scores exactly 100; a worst-case repository scores near 0 (bounded above 0 by the dependency-hygiene floor); the score is deterministic (same input, same output, always); an unmeasurable component is excluded from scoring rather than counted as a failure, and specifically cannot let the repository reach 100 (the confidence-cap regression test); a missing-tests repository costs exactly its declared weight when every other component is measured; commit-recency and dependency-hygiene curves are bounded and monotonic; the score never leaves `[0, 100]` across a spread of inputs. `component_scores(metrics)` (the pre-weighting breakdown) is tested directly alongside `health_score` where a claim is about which components survive, not just the final number.

  Two of these tests were written test-first against the prototype-driven fixes (commit-activity window, confidence cap): a failing test was confirmed red before the implementation existed, then made to pass with the minimal change.

**Supporting unit seams**, tested as pure functions directly rather than through the endpoint, because their contracts are independently meaningful and cheaper to pin at this level: `_has_tests` / `_has_ci` / `_has_readme` / `_count_dependencies` / `count_recent_commits` (`test_metrics.py`); `walk_repository` / `resolve_analysis_scope` / `take_by_suffix` / `language_breakdown` / `primary_code_language` (`test_scope.py`); `parse_repo_url` / `assert_within_size_limit` (`test_github.py`).

**Prior art**: this is the first feature in the codebase, so the test structure above establishes the pattern — HTTP-level tests for orchestration and contract, pure-function tests for anything with an independently statable invariant — rather than following an existing convention.

**Out of scope for this pass**: the JS/TS complexity path (`javascript_signal`) and the `radon`-backed Python path (`python_signal`) are not yet covered by tests against real fixture files — see Out of Scope below.

## Out of Scope

- Complexity analyzer integration tests (`python_signal` against real Python fixtures via `radon`; `javascript_signal` against real JS/TS fixtures via the pinned ESLint install) — the analyzers are exercised only indirectly, via the confidence-cap and language-detection logic that consumes their output.
- The Next.js frontend, the `/api/analyze` route, the Supabase schema and RLS policies, and the results UI — none of this exists yet in this build pass.
- Deployment (Vercel/Railway/Render) and the associated Dockerfile validation beyond a written, unexecuted `backend/Dockerfile`.
- Private repository support, GitHub OAuth, user accounts, and IP-based rate limiting — all explicitly deferred per the original project spec's "Then" section.
- Publishing this spec to a GitHub issue tracker — no GitHub remote exists yet for this repository as of this spec being written; a local `git init` was run in this session, but the remote and `gh` authentication are still pending.

## Further Notes

- The two defects fixed in this pass (commit-activity window, confidence cap) were found by a throwaway logic prototype (`backend/prototypes/health-score-formula.PROTOTYPE.html`) that drove the formula through five repository profiles before any real repository had exercised it — not by code review or unit testing. The prototype is retained, deliberately un-synced with the fixed formula, as the primary source documenting how the defects were found; see [ADR-0003](../adr/0003-health-score-activity-window-and-confidence-cap.md) for the fix itself.
- `CONTEXT.md` is the authoritative glossary for the vocabulary used throughout this spec (Target Repository, Report, Partial Report, Metrics, Health Score, Complexity Signal, Analysis Scope, AI Summary) — consult it before renaming or introducing terms in implementation.
- The backend test suite is green at 84 tests as of this spec (`backend/tests/`, run via `pytest` from `backend/` with `PYTHONPATH=.`).
