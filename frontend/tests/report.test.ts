import { describe, expect, it } from "vitest";

import { aiSummaryReason, canBeMadePublic } from "@/lib/report";

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

const summary = { strengths: ["x"], risks: ["y"], suggestions: ["z"] };

/**
 * Issue #25: distinguishes a subscriber's failed (and therefore refundable)
 * attempt from a free-tier/anonymous request that never tried at all --
 * both currently collapse into the same `ai_summary: null`.
 */
describe("aiSummaryReason", () => {
  it("is null once an AI Summary was generated", () => {
    expect(aiSummaryReason(true, summary)).toBeNull();
    expect(aiSummaryReason(false, summary)).toBeNull();
  });

  it("is 'failed' when generation was attempted but came back empty", () => {
    expect(aiSummaryReason(true, null)).toBe("failed");
  });

  it("is 'skipped_free_tier' when generation was never attempted", () => {
    expect(aiSummaryReason(false, null)).toBe("skipped_free_tier");
  });
});
