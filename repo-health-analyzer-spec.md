# Project: Repo Health Analyzer

A full-stack portfolio project that analyzes a public GitHub repository and returns a saved, shareable code health report combining a deterministic score with an AI-generated qualitative summary.

See [CONTEXT.md](CONTEXT.md) for domain vocabulary (Target Repository, Report, Metrics, Health Score, Complexity Signal, Analysis Scope, AI Summary) and [docs/adr/](docs/adr/) for the reasoning behind the architecture below.

## Goal

Build a working end-to-end app demonstrating a Next.js/TypeScript frontend calling a Python FastAPI backend, which clones and statically analyzes a repository, computes a deterministic Health Score, and calls an LLM API for a qualitative summary.

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts
- **Backend:** Python, FastAPI, `radon` (for Python repos), ESLint with the `complexity` rule (for JS/TS repos), `git` (shallow clone)
- **Database:** Postgres via Supabase (store past reports)
- **AI:** Anthropic Claude API for the qualitative summary only (never the score)
- **Deployment:** Frontend on Vercel, backend on Railway or Render (must have `git` available in the container)

## Core Flow

1. User pastes a public GitHub repo URL on the homepage.
2. Next.js API route (`/api/analyze`) validates the URL shape (`github.com/{owner}/{repo}`) and forwards the request to the FastAPI backend (`POST /analyze`), attaching a shared-secret header.
3. FastAPI backend:
   - Checks the repo's size via the GitHub API before doing anything else; rejects with a clear error above a size threshold (e.g. 200MB).
   - Shallow-clones the repo (`git clone --depth 50`) into a temp directory. This is the sole source of file contents and commit history — no per-file GitHub Contents API calls.
   - Determines the Analysis Scope: walks the clone, drops excluded paths (fixed ignore list: `node_modules`, `.git`, `dist`, `build`, `vendor`, `__pycache__`, `.venv`, `target`, `.next`, `coverage`), then truncates to the analysis cap (500 files total) breadth-first by depth if still over.
   - Computes Metrics: file count, dependency count, presence of tests, presence of CI config, presence of README, commit recency (from local `git log`).
   - Complexity Signal: if the repo is Python-majority, run `radon cc`/`radon mi` on up to 100 Python files (same truncation rule as the file cap); if JS/TS-majority, run ESLint with only the `complexity` rule (no install of the repo's own dependencies) on up to 100 JS/TS files.
   - Computes the Health Score deterministically from Metrics via a fixed, roughly-equal-weighted formula (tests, CI, README, commit recency, dependency hygiene, Complexity Signal where available). The LLM never determines this score.
   - Sends a summarized digest to the Claude API, prompting for exactly: 3 strengths, 3 risks, 3 suggested improvements (no score in the response schema).
   - If the Claude call fails or times out, proceeds without an AI Summary rather than failing the request (Partial Report).
   - Returns structured JSON: `{ metrics, health_score, ai_summary | null, analysis_scope }`.
4. Next.js saves the Report to Supabase (via a server-side service-role key) and renders the results: score gauge, metric charts (Recharts), and the written AI summary (or an "AI summary unavailable" state for a Partial Report).
5. Report is given a shareable URL at `/report/[id]`. All reports are public by default — no privacy option in this build.

## Pages & Routes

- `/` — input form, list of recent public Reports
- `/report/[id]` — results page for a saved Report
- `/api/analyze` — Next.js route: validates input → calls FastAPI backend (with shared secret) → saves Report to DB (service-role key) → returns report id
- FastAPI `POST /analyze` — requires shared-secret header; accepts `{ repo_url }`, returns `{ metrics, health_score, ai_summary, analysis_scope }`

## Data Model (Supabase)

Table `reports`:
- `id` (uuid, pk)
- `repo_url` (text)
- `metrics` (jsonb)
- `health_score` (int)
- `ai_summary` (jsonb, nullable — null for a Partial Report)
- `created_at` (timestamp)

RLS: public `SELECT` allowed on `reports`; `INSERT` restricted to the service role (used only by the `/api/analyze` route, never the anon key).

## Build Instructions for Claude Code

1. Scaffold a new Next.js 14 app (App Router, TypeScript, Tailwind) in `/frontend`.
2. Scaffold a FastAPI app in `/backend` with a single `/analyze` endpoint, `requirements.txt`, and a `Dockerfile` suitable for Railway/Render deployment (must include `git`).
3. Implement shared-secret verification in FastAPI (reject requests missing/mismatching `X-Internal-Secret`) and the matching header send in the Next.js API route.
4. Implement the backend fetch/clone pipeline: repo-size pre-check via GitHub API, shallow clone, Analysis Scope resolution (ignore list + cap + truncation).
5. Implement Metrics calculation from the clone:
   - Language-agnostic heuristics (file count, dependency count, has tests, has CI config, has README, commit recency from local `git log`).
   - Python-specific: run `radon cc` and `radon mi` on up to 100 Python files.
   - JS/TS-specific: run ESLint with only the `complexity` rule on up to 100 JS/TS files.
6. Implement the deterministic Health Score formula as a pure, unit-testable function over Metrics.
7. Implement the Claude API call in the backend with a clear, structured prompt requesting JSON output (strengths, risks, suggestions only — no score). Handle failure/timeout by returning `ai_summary: null` rather than raising. Read the API key from an environment variable.
8. Build the results UI: a score gauge component, a bar/radar chart for metrics, clean typographic sections for strengths/risks/suggestions, and an "AI summary unavailable" state for Partial Reports.
9. Set up Supabase client in the Next.js app (service-role key for the `/api/analyze` write path, anon key for public reads), create the `reports` table + RLS policies via SQL migration file, and wire up save/fetch for `/report/[id]`.
10. Add `.env.example` files for both frontend and backend listing all required environment variables.
11. Add a root `README.md` explaining setup, env vars, and how to run both services locally against a real (free-tier) Supabase project — no deployment step included yet.
12. Write unit tests for the Health Score formula and the Metrics heuristics.
13. Keep styling clean and minimal — this is a portfolio piece, so visual polish on the results page matters as much as functionality.

## Environment Variables

**Frontend (`.env.local`):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by `/api/analyze`)
- `PYTHON_BACKEND_URL`
- `INTERNAL_API_SECRET`

**Backend (`.env`):**
- `ANTHROPIC_API_KEY`
- `GITHUB_TOKEN` (optional, raises clone/API rate limits)
- `INTERNAL_API_SECRET`

## Then

- Private repo support / GitHub OAuth
- User accounts
- Per-report privacy/unlisted option
- Rate limiting / abuse prevention beyond the shared-secret gate (IP-based limits if time allows)
- Deployment to Vercel/Railway (local-first for this build pass)
