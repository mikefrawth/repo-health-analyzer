import { describe, expect, it } from "vitest";

import { parseRepoUrl, repoLabel } from "@/lib/repo-url";

/**
 * This mirrors the backend's `parse_repo_url` (backend/app/github.py). The
 * frontend rejects a malformed URL before spending a backend call on it, so
 * the two must agree on what "a GitHub repository URL" means. These cases are
 * derived from the backend's regex, not from this implementation.
 */
describe("parseRepoUrl", () => {
  it("accepts a canonical https URL", () => {
    expect(parseRepoUrl("https://github.com/mikefrawth/repo-health-analyzer")).toEqual({
      owner: "mikefrawth",
      repo: "repo-health-analyzer",
    });
  });

  it("accepts a URL with no protocol", () => {
    expect(parseRepoUrl("github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("accepts http, www, a .git suffix and a trailing slash", () => {
    for (const url of [
      "http://github.com/owner/repo",
      "https://www.github.com/owner/repo",
      "https://github.com/owner/repo.git",
      "https://github.com/owner/repo/",
    ]) {
      expect(parseRepoUrl(url), url).toEqual({ owner: "owner", repo: "repo" });
    }
  });

  it("trims surrounding whitespace", () => {
    expect(parseRepoUrl("  https://github.com/owner/repo  ")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("accepts dots, underscores and hyphens in either segment", () => {
    expect(parseRepoUrl("https://github.com/my-org/my_repo.js")).toEqual({
      owner: "my-org",
      repo: "my_repo.js",
    });
  });

  it("rejects a host that is not github.com", () => {
    expect(parseRepoUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseRepoUrl("https://notgithub.com/owner/repo")).toBeNull();
  });

  it("rejects a URL with no repository segment", () => {
    expect(parseRepoUrl("https://github.com/owner")).toBeNull();
  });

  it("rejects a URL pointing deeper than the repository root", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/tree/main")).toBeNull();
  });

  it("rejects empty and whitespace-only input", () => {
    expect(parseRepoUrl("")).toBeNull();
    expect(parseRepoUrl("   ")).toBeNull();
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
