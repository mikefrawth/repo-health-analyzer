# Repo Health Analyzer

Analyzes a public GitHub repository and produces a saved, shareable **Report**: a
deterministic 0–100 **Health Score**, the objective **Metrics** it was computed
from, the **Analysis Scope** that was actually examined, and an AI-written
summary of strengths, risks, and suggestions.

The Health Score is a pure function of the Metrics. The AI summary is written
*from* those Metrics and never changes the score — and if the summary step
fails, the Report is still saved and shown, as a **Partial Report**.

See [CONTEXT.md](CONTEXT.md) for the domain vocabulary and [docs/adr/](docs/adr/)
for the reasoning behind the architecture.

## Layout

| Path        | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `backend/`  | FastAPI service: clone, measure, score, summarize                  |
| `frontend/` | Next.js 14 app: submit form, results UI, Supabase persistence      |
| `docs/`     | Specs and ADRs                                                     |

## Prerequisites

- **Python 3.11+** and **`git` on your PATH** (the backend shallow-clones repositories)
- **Node.js 18.17+** and npm
- A free-tier **Supabase** project
- An **Anthropic API key** — optional. Without one, every Report is a Partial
  Report, which is a good way to see that path working.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the project's **SQL Editor** and run
   [`frontend/supabase/migrations/0001_create_reports.sql`](frontend/supabase/migrations/0001_create_reports.sql).
   This creates the `reports` table and its RLS policies: anyone may read a
   Report, and only the service role may write one.
3. From **Project Settings → API**, copy the project URL, the `anon` key, and
   the `service_role` key.

## 2. Set up GitHub OAuth login

Login (added in #20) needs a GitHub OAuth App and Supabase's GitHub provider
configured — both are external dashboard steps, not something a migration or
env var can do for you. Run the interactive setup script from the repo root,
which walks through both:

```bash
bash scripts/setup-github-oauth-supabase.sh
```

It opens each page, tells you exactly what to click/paste, and also covers
adding a Vercel deployment's redirect URL once you have one — you only need
to create the GitHub OAuth App once; re-run the script (or just revisit the
Supabase Auth "URL Configuration" page it links to) to add a new environment
later.

## 3. Run the backend

```bash
cd backend
python -m venv .venv
```

Activate it — `.venv\Scripts\activate` on Windows, `source .venv/bin/activate`
elsewhere — then:

```bash
pip install -r requirements.txt
```

Copy `backend/.env.example` to `backend/.env` and fill it in. At minimum set
`INTERNAL_API_SECRET` to any random string; you'll use the same value in the
frontend.

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Check it: `curl http://127.0.0.1:8000/health` should return `{"status":"ok"}`.

> The JS/TS Complexity Signal needs the pinned ESLint install. It's optional
> for running the server locally — without it, JS/TS repositories simply get
> no Complexity Signal. To enable it, run `npm install` in `backend/js-analyzer`
> and point `JS_ANALYZER_DIR` at that directory. The test suite (below) needs
> it too, to run the full `javascript_signal` coverage rather than skipping it.

## 4. Run the frontend

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env.local` and fill in the three
Supabase values. Set `INTERNAL_API_SECRET` to **the same string** you gave the
backend — a mismatch makes the backend reject every request.

```bash
npm run dev
```

Open <http://localhost:3000> and paste a public repository URL. Try a small one
first: `https://github.com/octocat/Hello-World` analyzes in a couple of seconds.

## Environment variables

**`backend/.env`**

| Variable              | Required | Purpose                                                |
| --------------------- | -------- | ------------------------------------------------------ |
| `INTERNAL_API_SECRET` | yes      | Shared secret gating `POST /analyze`                    |
| `ANTHROPIC_API_KEY`   | no       | AI Summary. Omit it and every Report is a Partial Report |
| `GITHUB_TOKEN`        | no       | Raises GitHub API rate limits for the size pre-check    |

**`frontend/.env.local`**

| Variable                        | Required | Purpose                                          |
| ------------------------------- | -------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes      | Supabase project URL                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes      | Public read access to Reports                    |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes      | Server-only write access. Never expose to the browser |
| `PYTHON_BACKEND_URL`            | yes      | Where the backend is listening                   |
| `INTERNAL_API_SECRET`           | yes      | Must match the backend's                         |

## Tests

```bash
npm ci --prefix backend/js-analyzer
cd backend && python -m pytest
```

The first line provisions the pinned ESLint install that `test_complexity.py`
runs the `javascript_signal` tests against. Skip it and those two tests are
skipped rather than failed — fine for a quick local run, but a fresh clone
following this README gets the full, real-ESLint suite.

```bash
cd frontend && npm test
```

Frontend typechecking:

```bash
cd frontend && npm run typecheck
```

## Deploying the backend

The backend runs as the Docker image built from
[`backend/Dockerfile`](backend/Dockerfile) — it needs `git` and `node` on
PATH and a long-running process, which rules out Vercel's Python serverless
runtime. [`render.yaml`](render.yaml) at the repo root is a Render Blueprint
for it:

1. Push this repo to GitHub and create a new Blueprint on
   [render.com](https://render.com) pointing at it.
2. Render builds `backend/Dockerfile` and creates a web service on the free
   plan. Fill in `INTERNAL_API_SECRET`, `ANTHROPIC_API_KEY`, and `GITHUB_TOKEN`
   in the service's Environment tab (marked `sync: false` in the blueprint so
   they aren't stored in git).
3. Point the frontend's `PYTHON_BACKEND_URL` at the Render service's URL.

Deploy the frontend to Vercel as usual — it's a standard Next.js app.

## Not included in this build

Private repository support, GitHub OAuth, user accounts, per-report privacy,
and IP-based rate limiting are all out of scope — see the "Then" section of
[`repo-health-analyzer-spec.md`](repo-health-analyzer-spec.md).
