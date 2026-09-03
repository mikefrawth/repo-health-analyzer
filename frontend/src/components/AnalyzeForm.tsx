"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  describeAnalyzeFailure,
  type AnalyzeErrorCode,
  type AnalyzeFailure,
} from "@/lib/analyze-errors";
import { INVALID_REPO_URL_MESSAGE, parseRepoUrl } from "@/lib/repo-url";

/**
 * A heading per failure mode, so the five the backend distinguishes stay
 * distinguishable to the reader — not collapsed into one "error" banner.
 */
const FAILURE_TITLE: Record<AnalyzeErrorCode, string> = {
  invalid_url: "That URL doesn't look right",
  not_found: "We couldn't find that repository",
  needs_private_scope: "This might be a private repository",
  rate_limited: "GitHub is rate-limiting us",
  too_large: "That repository is too large",
  upstream_failed: "The analysis didn't finish",
  backend_unreachable: "The analysis service is unreachable",
  service_misconfigured: "The analysis service is misconfigured",
  unknown: "Something went wrong",
};

export function AnalyzeForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Issue #24: round-tripped back through `?repo=` after a "grant access to
  // private repos" redirect (see the link below), so the user doesn't have
  // to retype the URL they already typed once, just because granting access
  // meant leaving the page.
  const [repoUrl, setRepoUrl] = useState(() => searchParams.get("repo") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AnalyzeFailure | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFailure(null);

    // Caught here so an obvious typo costs nothing and answers instantly.
    if (!parseRepoUrl(repoUrl)) {
      setFailure({ code: "invalid_url", message: INVALID_REPO_URL_MESSAGE });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl }),
      });

      if (response.ok) {
        const { id } = (await response.json()) as { id: string };
        router.push(`/report/${id}`);
        // The homepage is prefetched by the header link, so its recent-Reports
        // list is already sitting in Next's client Router Cache — without this,
        // coming back here would show the list as it was before this Report
        // existed. `refresh` drops that cache.
        router.refresh();
        // Deliberately stay in the submitting state through navigation, so the
        // button doesn't flicker back to idle while the next page loads.
        return;
      }

      setFailure(await readFailure(response));
    } catch {
      // The request never completed — a dead network or a dead dev server.
      setFailure(describeAnalyzeFailure(null));
    }
    setSubmitting(false);
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="repo-url" className="sr-only">
          GitHub repository URL
        </label>
        <input
          id="repo-url"
          name="repo-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          // Never cleared on failure: the user's input is usually nearly right.
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="https://github.com/owner/repo"
          disabled={submitting}
          aria-invalid={failure !== null}
          aria-describedby={failure ? "analyze-failure" : undefined}
          className="w-full flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100 disabled:text-slate-400"
        />
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {submitting ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {submitting ? (
        <p className="mt-3 text-sm text-slate-500">
          Cloning the repository and writing the summary — this usually takes under a
          minute.
        </p>
      ) : null}

      {failure ? (
        <div
          id="analyze-failure"
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4"
        >
          <p className="text-sm font-semibold text-rose-900">
            {FAILURE_TITLE[failure.code]}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-rose-800">{failure.message}</p>
          {failure.code === "needs_private_scope" ? (
            <a
              href={`/auth/login?scope=private&next=${encodeURIComponent(grantAccessReturnPath(pathname, repoUrl))}`}
              className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
            >
              Grant access to private repos
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Where `/auth/login`'s consent step should return the visitor, carrying
 * their already-typed repo URL along so they don't have to retype it. */
function grantAccessReturnPath(pathname: string | null, repoUrl: string): string {
  const path = pathname || "/";
  return repoUrl ? `${path}?repo=${encodeURIComponent(repoUrl)}` : path;
}

/** Read the route's `{error: {code, message}}` body, tolerating a body-less response. */
async function readFailure(response: Response): Promise<AnalyzeFailure> {
  try {
    const body = (await response.json()) as { error?: Partial<AnalyzeFailure> };
    if (body.error?.code && body.error.message) {
      return { code: body.error.code, message: body.error.message };
    }
  } catch {
    // Fall through to deriving the failure from the status alone.
  }
  return describeAnalyzeFailure(response.status);
}
