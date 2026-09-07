import { describe, expect, it } from "vitest";

import { sanitizeNext } from "@/lib/sanitize-next";

/**
 * Shared by /auth/login and /auth/callback (issue #43) — an open-redirect
 * guard is exactly the code that must not drift between two copies.
 */
describe("sanitizeNext", () => {
  it("passes through an in-app path", () => {
    expect(sanitizeNext("/reports/123")).toBe("/reports/123");
  });

  it("falls back to / for null", () => {
    expect(sanitizeNext(null)).toBe("/");
  });

  it("falls back to / for an empty string", () => {
    expect(sanitizeNext("")).toBe("/");
  });

  it("falls back to / for a path not starting with /", () => {
    expect(sanitizeNext("evil.example.com")).toBe("/");
  });

  it("rejects a protocol-relative URL, which browsers treat as a redirect to another host", () => {
    expect(sanitizeNext("//evil.example.com")).toBe("/");
  });
});
