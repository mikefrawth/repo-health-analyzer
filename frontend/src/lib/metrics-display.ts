/**
 * Turning Metrics into things a reader can look at.
 *
 * Nothing here recomputes any part of the Health Score — the backend owns that
 * formula (ADR-0001), and duplicating even one component's curve here would let
 * the two drift. This module only formats what the backend already decided.
 */

import type { ComplexitySignal } from "./report";

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
