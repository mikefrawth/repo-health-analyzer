import { describe, expect, it } from "vitest";

import {
  ANALYZE_ERROR_CODES,
  describeAnalyzeFailure,
  httpStatusFor,
  type AnalyzeErrorCode,
} from "@/lib/analyze-errors";

/**
 * The five failure modes ticket #5 requires the form to tell apart. Statuses
 * come from the backend's error surface (backend/app/errors.py usage): 400 bad
 * URL shape, 404 private-or-missing, 429 GitHub rate limit, 413 oversized,
 * 502/504 clone failure or timeout — plus never reaching the backend at all.
 */
describe("describeAnalyzeFailure", () => {
  it("maps each backend status to its own code", () => {
    expect(describeAnalyzeFailure(400).code).toBe("invalid_url");
    expect(describeAnalyzeFailure(404).code).toBe("not_found");
    expect(describeAnalyzeFailure(429).code).toBe("rate_limited");
    expect(describeAnalyzeFailure(413).code).toBe("too_large");
    expect(describeAnalyzeFailure(502).code).toBe("upstream_failed");
    expect(describeAnalyzeFailure(504).code).toBe("upstream_failed");
  });

  it("treats never reaching the backend as its own failure, not a bad URL", () => {
    const failure = describeAnalyzeFailure(null);
    expect(failure.code).toBe("backend_unreachable");
    expect(failure.code).not.toBe(describeAnalyzeFailure(400).code);
  });

  it("treats our own backend rejecting us as misconfiguration, not user error", () => {
    // 401 = the shared secret doesn't match; 500 = the backend has no secret set.
    // Both mean the operator wired something up wrong, and neither is anything
    // the person pasting a URL can act on.
    expect(describeAnalyzeFailure(401).code).toBe("service_misconfigured");
    expect(describeAnalyzeFailure(500).code).toBe("service_misconfigured");
  });

  it("never repeats the backend's internal detail for a misconfiguration", () => {
    // "Invalid or missing internal secret." is a fact about our deployment, not
    // something to show whoever is using the site.
    const failure = describeAnalyzeFailure(401, "Invalid or missing internal secret.");
    expect(failure.message).not.toContain("internal secret");
    expect(failure.message.length).toBeGreaterThan(0);
  });

  it("falls back to a generic code for a genuinely unexpected status", () => {
    expect(describeAnalyzeFailure(418).code).toBe("unknown");
  });

  it("gives every failure mode a distinct default message", () => {
    const messages = ANALYZE_ERROR_CODES.map(
      (code) => defaultMessageFor(code),
    );
    expect(new Set(messages).size).toBe(messages.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("prefers the backend's own explanation when it sent one", () => {
    const detail = "Repository exceeds the 200MB size limit.";
    expect(describeAnalyzeFailure(413, detail).message).toBe(detail);
  });

  it("falls back to its own wording when the backend sent no detail", () => {
    for (const detail of [undefined, null, "", "   "]) {
      const failure = describeAnalyzeFailure(413, detail);
      expect(failure.message.length, `detail=${JSON.stringify(detail)}`).toBeGreaterThan(0);
      expect(failure.message.trim()).toBe(failure.message);
    }
  });

  it("never trusts a backend detail for an unreachable backend", () => {
    // There is no response, so there can be no detail to quote.
    const failure = describeAnalyzeFailure(null, "should be ignored");
    expect(failure.message).not.toContain("should be ignored");
  });

  it("describes a 404 as possibly-private, not merely missing", () => {
    // A private repo and a nonexistent one are indistinguishable to us, and
    // saying only "not found" sends the user hunting for a typo that isn't there.
    const message = describeAnalyzeFailure(404).message.toLowerCase();
    expect(message).toContain("private");
  });
});

describe("httpStatusFor", () => {
  it("echoes the backend's status for failures the backend diagnosed", () => {
    expect(httpStatusFor("invalid_url")).toBe(400);
    expect(httpStatusFor("not_found")).toBe(404);
    expect(httpStatusFor("too_large")).toBe(413);
    expect(httpStatusFor("rate_limited")).toBe(429);
    expect(httpStatusFor("upstream_failed")).toBe(502);
  });

  it("reports an unreachable backend as unavailable, not as our own error", () => {
    expect(httpStatusFor("backend_unreachable")).toBe(503);
    expect(httpStatusFor("unknown")).toBe(500);
    expect(httpStatusFor("service_misconfigured")).toBe(500);
  });

  it("never returns a success status for any failure", () => {
    for (const code of ANALYZE_ERROR_CODES) {
      expect(httpStatusFor(code), code).toBeGreaterThanOrEqual(400);
    }
  });
});

function defaultMessageFor(code: AnalyzeErrorCode): string {
  const status: Record<AnalyzeErrorCode, number | null> = {
    invalid_url: 400,
    not_found: 404,
    rate_limited: 429,
    too_large: 413,
    upstream_failed: 502,
    backend_unreachable: null,
    service_misconfigured: 401,
    unknown: 418,
  };
  return describeAnalyzeFailure(status[code]).message;
}
