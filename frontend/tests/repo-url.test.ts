import { describe, expect, it } from "vitest";

import { parseRepoUrl, repoLabel } from "@/lib/repo-url";
import repoUrlCases from "../../repo-url-cases.json";

/**
 * This mirrors the backend's `parse_repo_url` (backend/app/github.py). The
 * frontend rejects a malformed URL before spending a backend call on it, so
 * the two must agree on what "a GitHub repository URL" means. The cases below
 * are shared with backend/tests/test_github.py via repo-url-cases.json, so a
 * change on either side that drifts from the other fails a test instead of
 * shipping unnoticed. See issue #42.
 */
describe("parseRepoUrl", () => {
  it.each(repoUrlCases.accept)("accepts $url", ({ url, owner, repo }) => {
    expect(parseRepoUrl(url)).toEqual({ owner, repo });
  });

  it.each(repoUrlCases.reject)("rejects %j", (url) => {
    expect(parseRepoUrl(url)).toBeNull();
  });
});

describe("repoLabel", () => {
  it("shortens a URL to owner/repo", () => {
    expect(repoLabel("https://github.com/mikefrawth/repo-health-analyzer.git")).toBe(
      "mikefrawth/repo-health-analyzer",
    );
  });

  it("falls back to the stored URL rather than hiding a saved Report", () => {
    expect(repoLabel("https://example.com/weird")).toBe("https://example.com/weird");
  });
});
