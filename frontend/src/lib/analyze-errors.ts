/**
 * Turning an analysis failure into something the user can act on.
 *
 * The backend already writes readable messages for the failures it knows about
 * (AnalysisError in backend/app/errors.py), so we quote it when it spoke. The
 * codes exist so the UI can tell the modes apart without string-matching, and
 * so a failure we never got a response for is visibly different from a repo the
 * backend actively rejected.
 */

import { INVALID_REPO_URL_MESSAGE } from "./repo-url";

export const ANALYZE_ERROR_CODES = [
  "invalid_url",
  "not_found",
  "needs_private_scope",
  "rate_limited",
  "too_large",
  "upstream_failed",
  "backend_unreachable",
  "service_misconfigured",
  "unknown",
] as const;

export type AnalyzeErrorCode = (typeof ANALYZE_ERROR_CODES)[number];

export type AnalyzeFailure = {
  code: AnalyzeErrorCode;
  message: string;
};

const DEFAULT_MESSAGES: Record<AnalyzeErrorCode, string> = {
  // Shared with the client-side shape check, so the user reads the same
  // sentence whether we caught it or the backend did.
  invalid_url: INVALID_REPO_URL_MESSAGE,
  not_found:
    "We couldn't find that repository. It may not exist, be misspelled, or be " +
    "private — log in to analyze your own private repositories.",
  needs_private_scope:
    "This may be a private repository. Grant access to your private GitHub " +
    "repositories to try again.",
  rate_limited:
    "GitHub is rate-limiting us right now. Wait a few minutes and try again.",
  too_large:
    "That repository is too large to analyze. Try a smaller one.",
  upstream_failed:
    "We reached GitHub but couldn't finish cloning the repository — it may have " +
    "timed out. Try again in a moment.",
  backend_unreachable:
    "We couldn't reach the analysis service. It may be starting up or offline — " +
    "try again in a moment.",
  service_misconfigured:
    "The analysis service isn't configured correctly, so nothing was analyzed. " +
    "If you're running this locally, check that INTERNAL_API_SECRET is set to the " +
    "same value in backend/.env and frontend/.env.local.",
  unknown: "Something went wrong while analyzing that repository. Please try again.",
};

function codeForStatus(status: number | null): AnalyzeErrorCode {
  switch (status) {
    case null:
      return "backend_unreachable";
    case 400:
      return "invalid_url";
    case 404:
      return "not_found";
    case 413:
      return "too_large";
    case 429:
      return "rate_limited";
    case 502:
    case 504:
      return "upstream_failed";
    // Our own backend refusing or failing to serve us: a mismatched shared
    // secret (401) or a backend started without one at all (500).
    case 401:
    case 500:
      return "service_misconfigured";
    default:
      return "unknown";
  }
}

const HTTP_STATUSES: Record<AnalyzeErrorCode, number> = {
  invalid_url: 400,
  not_found: 404,
  // Distinct from a plain 404: the repo may well exist, just not visibly to
  // the requester's current token — 403 ("more permission would help") reads
  // more accurately than repeating the backend's ambiguous 404.
  needs_private_scope: 403,
  too_large: 413,
  rate_limited: 429,
  upstream_failed: 502,
  // The analysis service being down is an availability problem on our side, and
  // saying so plainly is more useful than a blanket 500.
  backend_unreachable: 503,
  service_misconfigured: 500,
  unknown: 500,
};

/** The status `/api/analyze` should answer with for a given failure. */
export function httpStatusFor(code: AnalyzeErrorCode): number {
  return HTTP_STATUSES[code];
}

/**
 * `status` is the backend's HTTP status, or `null` when no response arrived at
 * all. `detail` is the backend's `{"detail": ...}` message, when there was one.
 * `backendCode` is the backend's own `{"code": ...}` (`AnalysisError.code` in
 * backend/app/errors.py), for the handful of failures a bare HTTP status
 * can't distinguish — e.g. `needs_private_scope` is still a 404 on the wire.
 */
export function describeAnalyzeFailure(
  status: number | null,
  detail?: string | null,
  backendCode?: string | null,
): AnalyzeFailure {
  const code =
    backendCode === "needs_private_scope" ? "needs_private_scope" : codeForStatus(status);
  // Two cases where the backend's own words are the wrong thing to show: there
  // was no response to quote, or the detail describes our deployment rather
  // than anything the reader did ("Invalid or missing internal secret.").
  const quotable = code !== "backend_unreachable" && code !== "service_misconfigured";
  const quoted = quotable ? (detail ?? "").trim() : "";
  return { code, message: quoted || DEFAULT_MESSAGES[code] };
}
