import { describe, expect, it } from "vitest";

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
