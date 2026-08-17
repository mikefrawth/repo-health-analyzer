/**
 * Validating the shape of a Target Repository URL.
 *
 * The backend validates this too (`parse_repo_url` in backend/app/github.py) and
 * remains the authority — this copy exists only so an obviously-malformed URL is
 * rejected without spending a backend round trip on it. The pattern is kept
 * deliberately identical to the backend's so the two can never disagree about
 * what they accept.
 */

const REPO_URL_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i;

export type ParsedRepoUrl = {
  owner: string;
  repo: string;
};

/** Pull `{owner, repo}` out of a GitHub URL, or `null` if it isn't one. */
export function parseRepoUrl(url: string): ParsedRepoUrl | null {
  const match = REPO_URL_PATTERN.exec(url.trim());
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * A Target Repository's short `owner/repo` label. Falls back to the stored URL
 * when it doesn't parse — a Report that exists is always worth showing, even if
 * its URL came from a version of the rules this one no longer recognises.
 */
export function repoLabel(url: string): string {
  const parsed = parseRepoUrl(url);
  return parsed ? `${parsed.owner}/${parsed.repo}` : url;
}

/**
 * The message shown when a URL fails the shape check. Worded to match the
 * backend's equivalent rejection, so the user sees one consistent explanation
 * whichever side caught it.
 */
export const INVALID_REPO_URL_MESSAGE =
  "That doesn't look like a GitHub repository URL. " +
  "Expected something like https://github.com/owner/repo";
