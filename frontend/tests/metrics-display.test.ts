import { describe, expect, it } from "vitest";

import {
  COMPONENTS,
  NOT_MEASURED,
  componentScoreChartData,
  describeComplexity,
  formatDependencyCount,
  formatLastCommit,
  healthScoreBand,
  languageChartData,
} from "@/lib/metrics-display";
import type { ComplexitySignal, ComponentScores } from "@/lib/report";

describe("formatDependencyCount", () => {
  // The core distinction from user story 18: "we couldn't check" must never be
  // presented as "we checked and found none".
  it("distinguishes an unmeasurable count from a genuine zero", () => {
    expect(formatDependencyCount(null)).toBe(NOT_MEASURED);
    expect(formatDependencyCount(0)).toBe("0");
    expect(formatDependencyCount(0)).not.toBe(formatDependencyCount(null));
  });

  it("renders a measured count plainly", () => {
    expect(formatDependencyCount(37)).toBe("37");
  });
});

describe("formatLastCommit", () => {
  it("reports an unknown recency rather than inventing one", () => {
    expect(formatLastCommit(null)).toBe(NOT_MEASURED);
  });

  it("describes same-day and single-day recency without pluralising wrongly", () => {
    expect(formatLastCommit(0)).toBe("Today");
    expect(formatLastCommit(0.4)).toBe("Today");
    expect(formatLastCommit(1)).toBe("1 day ago");
  });

  it("rounds fractional days to whole days", () => {
    expect(formatLastCommit(45.6)).toBe("46 days ago");
  });

  it("switches to months and years once days stop being readable", () => {
    expect(formatLastCommit(60)).toBe("2 months ago");
    expect(formatLastCommit(365)).toBe("1 year ago");
    expect(formatLastCommit(900)).toBe("2 years ago");
  });
});

describe("describeComplexity", () => {
  it("reports an absent Complexity Signal as unmeasured", () => {
    // An unsupported language is not a failure — it simply has no signal.
    expect(describeComplexity(null)).toEqual({ label: NOT_MEASURED, detail: null });
  });

  it("labels radon maintainability with its scale direction", () => {
    const signal: ComplexitySignal = {
      language: "python",
      kind: "maintainability",
      value: 72.4,
      files_analyzed: 88,
    };
    const { label, detail } = describeComplexity(signal);
    expect(label).toBe("72.4");
    expect(detail).toContain("maintainability");
    expect(detail).toContain("88");
  });

  it("labels average cyclomatic complexity with its scale direction", () => {
    const signal: ComplexitySignal = {
      language: "javascript",
      kind: "avg_cyclomatic",
      value: 3.25,
      files_analyzed: 12,
    };
    const { label, detail } = describeComplexity(signal);
    expect(label).toBe("3.3");
    expect(detail).toContain("cyclomatic");
  });
});

describe("languageChartData", () => {
  it("orders languages by file count, descending", () => {
    const data = languageChartData({ Python: 10, Markdown: 3, TypeScript: 25 });
    expect(data.map((d) => d.language)).toEqual(["TypeScript", "Python", "Markdown"]);
    expect(data.map((d) => d.files)).toEqual([25, 10, 3]);
  });

  it("returns nothing for an empty breakdown", () => {
    expect(languageChartData({})).toEqual([]);
  });

  it("keeps the breakdown readable by bucketing the long tail into Other", () => {
    const breakdown = { A: 50, B: 40, C: 30, D: 20, E: 10, F: 5, G: 3, H: 2 };
    const data = languageChartData(breakdown, 5);
    expect(data).toHaveLength(6);
    expect(data.slice(0, 5).map((d) => d.language)).toEqual(["A", "B", "C", "D", "E"]);
    // The tail is summed, never dropped: 5 + 3 + 2.
    expect(data[5]).toEqual({ language: "Other", files: 10 });
  });

  it("adds no Other bucket when everything already fits", () => {
    const data = languageChartData({ A: 2, B: 1 }, 5);
    expect(data.map((d) => d.language)).toEqual(["A", "B"]);
  });
});

describe("componentScoreChartData", () => {
  it("maps every weighted component to a row, in weight-table order", () => {
    const scores: ComponentScores = {
      tests: 1,
      ci: 1,
      readme: 1,
      commit_recency: 1,
      commit_activity: 1,
      dependency_hygiene: 1,
      complexity: 1,
    };
    const data = componentScoreChartData(scores);
    expect(data.map((d) => d.key)).toEqual(Object.keys(COMPONENTS));
    expect(data.every((d) => d.measured)).toBe(true);
  });

  it("scales a component's points by its weight and score", () => {
    const data = componentScoreChartData({ tests: 0.5 } as ComponentScores);
    const tests = data.find((d) => d.key === "tests");
    expect(tests).toMatchObject({ points: COMPONENTS.tests.weight * 0.5, measured: true });
    // A measured component draws exactly what it contributes.
    expect(tests?.barValue).toBe(tests?.points);
  });

  it("gives an unmeasured component no contribution, but still a visible bar", () => {
    const data = componentScoreChartData({} as ComponentScores);
    const complexity = data.find((d) => d.key === "complexity");

    // CONTEXT.md's Component Score entry: a component with no Component Score is
    // dropped from the formula's renormalization, so it contributes nothing.
    // Drawing it at its full weight read as a *perfect* score on that component.
    expect(complexity).toMatchObject({ measured: false, points: 0 });

    // Ticket #9 still requires it never render as an empty slot, so the bar is a
    // short stub: visible, and too short to be mistaken for any real contribution.
    const smallestWeight = Math.min(...Object.values(COMPONENTS).map((c) => c.weight));
    expect(complexity?.barValue).toBeGreaterThan(0);
    expect(complexity?.barValue).toBeLessThan(smallestWeight);
  });

  it("distinguishes an unmeasured component from one that genuinely scored zero", () => {
    const unmeasured = componentScoreChartData({} as ComponentScores).find(
      (d) => d.key === "complexity",
    );
    const scoredZero = componentScoreChartData({ complexity: 0 } as ComponentScores).find(
      (d) => d.key === "complexity",
    );

    // Both contribute nothing — the difference is that one was measurable.
    expect(scoredZero).toMatchObject({ measured: true, points: 0, barValue: 0 });
    expect(scoredZero?.points).toBe(unmeasured?.points);
    expect(scoredZero?.barValue).not.toBe(unmeasured?.barValue);
  });

  it("gives every row a human-readable label", () => {
    const data = componentScoreChartData({} as ComponentScores);
    expect(data.map((d) => d.label)).toEqual([
      "Tests",
      "CI configuration",
      "README",
      "Commit recency",
      "Commit activity",
      "Dependency hygiene",
      "Complexity",
    ]);
  });
});

describe("healthScoreBand", () => {
  it("bands scores at its documented boundaries", () => {
    expect(healthScoreBand(100)).toBe("strong");
    expect(healthScoreBand(80)).toBe("strong");
    expect(healthScoreBand(79)).toBe("fair");
    expect(healthScoreBand(60)).toBe("fair");
    expect(healthScoreBand(59)).toBe("weak");
    expect(healthScoreBand(40)).toBe("weak");
    expect(healthScoreBand(39)).toBe("poor");
    expect(healthScoreBand(0)).toBe("poor");
  });
});
