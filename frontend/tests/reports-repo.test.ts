import { describe, expect, it, vi } from "vitest";

import { isReportId } from "@/lib/reports-repo";

/**
 * Report ids reach us straight from the URL, so a junk id must be answered as
 * "no such Report" rather than reaching Postgres and erroring on uuid syntax.
 */
describe("isReportId", () => {
  it("accepts a well-formed uuid in either case", () => {
    expect(isReportId("3c2b0cf6-a007-480e-b234-11c5455dbbab")).toBe(true);
    expect(isReportId("3C2B0CF6-A007-480E-B234-11C5455DBBAB")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isReportId("  3c2b0cf6-a007-480e-b234-11c5455dbbab  ")).toBe(true);
  });

  it("rejects anything that would make Postgres complain", () => {
    for (const value of [
      "",
      "not-a-uuid",
      "123",
      "3c2b0cf6a007480eb23411c5455dbbab", // unhyphenated
      "3c2b0cf6-a007-480e-b234-11c5455dbba", // one char short
      "3c2b0cf6-a007-480e-b234-11c5455dbbabb", // one char long
      "3c2b0cf6-a007-480e-b234-11c5455dbbaz", // non-hex
      "'; drop table reports; --",
    ]) {
      expect(isReportId(value), value).toBe(false);
    }
  });
});

/**
 * Issue #40: a non-uuid id must never reach Postgres here either — the same
 * malformed-uuid error (`22P02`) that fetchReport already guards against
 * would otherwise 500 the visibility route instead of no-op'ing.
 */
describe("makeReportPublic", () => {
  it("rejects a malformed id without querying Supabase", async () => {
    const update = vi.fn();
    vi.doMock("@/lib/supabase-server", () => ({
      serverClient: () => ({ from: () => ({ update }) }),
    }));
    vi.doMock("@/lib/supabase", () => ({ REPORTS_TABLE: "reports" }));

    const { makeReportPublic } = await import("@/lib/reports-repo");

    await expect(makeReportPublic("not-a-uuid")).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/supabase-server");
    vi.doUnmock("@/lib/supabase");
    vi.resetModules();
  });
});
