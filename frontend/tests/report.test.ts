import { describe, expect, it } from "vitest";

import { canBeMadePublic } from "@/lib/report";

/**
 * Drives the "make public" toggle's visibility only — the actual guarantee
 * that a private-repo-sourced Report can never go public is enforced in
 * Postgres (migration 0005), not here.
 */
describe("canBeMadePublic", () => {
  it("is true for a private Report sourced from a public repo", () => {
    expect(canBeMadePublic({ is_public: false, source_repo_was_private: false })).toBe(true);
  });

  it("is false once the Report is already public", () => {
    expect(canBeMadePublic({ is_public: true, source_repo_was_private: false })).toBe(false);
  });

  it("is false for a Report sourced from a private repo, even while private", () => {
    expect(canBeMadePublic({ is_public: false, source_repo_was_private: true })).toBe(false);
  });
});
