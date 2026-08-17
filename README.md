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

## 2. Run the backend

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
> locally — without it, JS/TS repositories simply get no Complexity Signal. To
> enable it, run `npm install` in `backend/js-analyzer` and point
> `JS_ANALYZER_DIR` at that directory.

## 3. Run the frontend

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
cd backend && python -m pytest
```

```bash
cd frontend && npm test
```

Frontend typechecking:

```bash
cd frontend && npm run typecheck
```

## Not included in this build

Deployment (Vercel/Railway/Render), private repository support, GitHub OAuth,
user accounts, per-report privacy, and IP-based rate limiting are all out of
scope — see the "Then" section of
[`repo-health-analyzer-spec.md`](repo-health-analyzer-spec.md).
