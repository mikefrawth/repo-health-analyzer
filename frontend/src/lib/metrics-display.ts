/**
 * Turning Metrics into things a reader can look at.
 *
 * Nothing here recomputes any part of the Health Score — the backend owns that
 * formula (ADR-0001), and duplicating even one component's curve here would let
 * the two drift. This module only formats what the backend already decided.
 */

import type { ComplexitySignal, ComponentScores } from "./report";

/**
 * Shown wherever a measurement could not be taken. Deliberately distinct from
 * any real value: "we couldn't check" must never read as "we checked and it was
 * zero" (see ADR-0003's confidence cap, which exists for the same reason).
 */
export const NOT_MEASURED = "Not measured";

export function formatDependencyCount(count: number | null): string {
  return count === null ? NOT_MEASURED : String(count);
}

export function formatLastCommit(daysAgo: number | null): string {
  if (daysAgo === null) {
    return NOT_MEASURED;
  }
  const days = Math.round(daysAgo);
  if (days <= 0) {
    return "Today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  if (days < 60) {
    return `${days} days ago`;
  }
  if (days < 365) {
    return `${Math.round(days / 30)} months ago`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export type ComplexityDescription = {
  label: string;
  detail: string | null;
};

export function describeComplexity(signal: ComplexitySignal | null): ComplexityDescription {
  if (signal === null) {
    return { label: NOT_MEASURED, detail: null };
  }
  const scale =
    signal.kind === "maintainability"
      ? "radon maintainability index — higher is better"
      : "average cyclomatic complexity per function — lower is better";
  return {
    label: signal.value.toFixed(1),
    detail: `${scale}, across ${signal.files_analyzed} files`,
  };
}

export type LanguageDatum = {
  language: string;
  files: number;
};

/**
 * The language breakdown as chart-ready series, largest first. Languages past
 * `limit` are summed into a single "Other" bucket rather than dropped, so the
 * totals still add up to what was analyzed.
 */
export function languageChartData(
  breakdown: Record<string, number>,
  limit = 6,
): LanguageDatum[] {
  const sorted = Object.entries(breakdown)
    .map(([language, files]) => ({ language, files }))
    .sort((a, b) => b.files - a.files);

  if (sorted.length <= limit) {
    return sorted;
  }

  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit).reduce((sum, entry) => sum + entry.files, 0);
  return tail > 0 ? [...head, { language: "Other", files: tail }] : head;
}

/**
 * The Health Score formula's fixed weights and display labels
 * (backend/app/scoring.py `WEIGHTS`), mirrored as data so the chart can show
 * each component's share — no scoring logic is duplicated, only the
 * published weight of an already-scored value (see ticket #9's note on
 * ADR-0001). One table, keyed once, so a component can't drift out of sync
 * between its weight and its label.
 */
export const COMPONENTS: Record<string, { label: string; weight: number }> = {
  tests: { label: "Tests", weight: 20 },
  ci: { label: "CI configuration", weight: 15 },
  readme: { label: "README", weight: 15 },
  commit_recency: { label: "Commit recency", weight: 12 },
  commit_activity: { label: "Commit activity", weight: 8 },
  dependency_hygiene: { label: "Dependency hygiene", weight: 10 },
  complexity: { label: "Complexity", weight: 20 },
};

/**
 * How long an unmeasured component's bar is drawn, in the same units as
 * `points`. Deliberately shorter than the smallest weight in `COMPONENTS`, so a
 * stub can never be read as a real contribution — it exists only to keep the
 * row visible.
 */
export const UNMEASURED_BAR_VALUE = 1;

export type ComponentScoreDatum = {
  key: string;
  label: string;
  /**
   * The component's weighted contribution: weight × score, and 0 when it has no
   * Component Score — an unmeasured component is dropped from the formula's
   * renormalization, so it contributes nothing (CONTEXT.md).
   */
  points: number;
  /**
   * What the bar actually draws. Equal to `points`, except for an unmeasured
   * component, which gets a short stub so its row never renders as an empty
   * slot (ticket #9). Kept separate from `points` so the bar can stay visible
   * without the number claiming a contribution that isn't there.
   */
  barValue: number;
  /** False when the component has no Component Score at all — never a 0. */
  measured: boolean;
};

/**
 * Every weighted component as a chart row, always in the same order and never
 * omitting one that's missing from `componentScores`. The caller must style
 * `measured: false` rows distinctly, so "not measured" is never confused with
 * "scored zero" — the two carry the same `points` and differ only in `barValue`.
 */
export function componentScoreChartData(componentScores: ComponentScores): ComponentScoreDatum[] {
  return Object.entries(COMPONENTS).map(([key, { label, weight }]) => {
    const score = componentScores[key];
    const measured = score !== undefined;
    const points = measured ? weight * score : 0;
    return {
      key,
      label,
      points,
      barValue: measured ? points : UNMEASURED_BAR_VALUE,
      measured,
    };
  });
}

export type HealthScoreBand = "strong" | "fair" | "weak" | "poor";

/** Purely a presentation banding for colour — not part of the score itself. */
export function healthScoreBand(score: number): HealthScoreBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "fair";
  if (score >= 40) return "weak";
  return "poor";
}

/**
 * How each band looks, in one place. Kept beside `healthScoreBand` so adding or
 * reweighting a band is a single edit rather than one per component that draws
 * a score.
 */
export const BAND_PRESENTATION: Record<
  HealthScoreBand,
  { label: string; color: string; chipClass: string }
> = {
  strong: {
    label: "Strong",
    color: "#10b981",
    chipClass: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  fair: {
    label: "Fair",
    color: "#eab308",
    chipClass: "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
  },
  weak: {
    label: "Weak",
    color: "#f97316",
    chipClass: "bg-orange-50 text-orange-700 ring-orange-600/20",
  },
  poor: {
    label: "Poor",
    color: "#ef4444",
    chipClass: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
};
