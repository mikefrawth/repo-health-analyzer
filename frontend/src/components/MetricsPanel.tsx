import { ComponentScoreChart } from "@/components/ComponentScoreChart";
import { LanguageChart } from "@/components/LanguageChart";
import {
  NOT_MEASURED,
  describeComplexity,
  formatCommitsInWindow,
  formatDependencyCount,
  formatLastCommit,
} from "@/lib/metrics-display";
import type { AnalysisScope, ComponentScores, ComponentWeights, Metrics } from "@/lib/report";

export function MetricsPanel({
  metrics,
  scope,
  componentScores,
  componentWeights,
}: {
  metrics: Metrics;
  scope: AnalysisScope;
  componentScores: ComponentScores;
  componentWeights: ComponentWeights;
}) {
  const complexity = describeComplexity(metrics.complexity);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Component Scores
        </h2>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <ComponentScoreChart
            componentScores={componentScores}
            componentWeights={componentWeights}
          />
          {/*
            Not called a "contribution to the Health Score": the formula
            renormalizes over the weight that could actually be measured and
            then applies a confidence cap (ADR-0003), so these bars deliberately
            don't sum to the Health Score shown above.
          */}
          <p className="mt-3 text-xs leading-snug text-slate-400">
            Each component&rsquo;s weight × its Component Score. The Health Score
            renormalizes these over what could be measured and caps the result, so
            they don&rsquo;t add up to it directly.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Measurements
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/*
            `file_count` is the backend's `scope.total_seen` — everything left
            after excluded paths were dropped, before any truncation. Calling it
            "analyzed" would contradict the Analysis Scope panel below, which
            reports the smaller number that was actually examined.
          */}
          <MetricCard label="Files found" value={String(metrics.file_count)} />
          <MetricCard
            label="Dependencies"
            value={formatDependencyCount(metrics.dependency_count)}
            note={
              metrics.dependency_count === null
                ? "No manifest we parse was found — not the same as having none."
                : null
            }
          />
          <MetricCard
            label="Last commit"
            value={formatLastCommit(metrics.last_commit_days_ago)}
          />
          <MetricCard
            label="Commits (last 90 days)"
            value={formatCommitsInWindow(metrics.commits_in_window)}
            note="Counted within a trailing window, so old history can't read as activity."
          />
          <MetricCard
            label="Primary language"
            value={metrics.primary_language ?? NOT_MEASURED}
          />
          <MetricCard
            label="Complexity"
            value={complexity.label}
            note={
              complexity.detail ??
              "No supported analyzer for this language — absent, not a penalty."
            }
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Language breakdown
        </h2>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <LanguageChart breakdown={metrics.language_breakdown} />
        </div>
      </section>

      <ScopeDisclosure scope={scope} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  // Derived from the formatted value rather than re-tested against the raw
  // Metric at every call site: one place decides what "unmeasurable" looks like.
  const muted = value === NOT_MEASURED;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold tracking-tight ${
          muted ? "text-slate-400" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {note ? <p className="mt-1.5 text-xs leading-snug text-slate-400">{note}</p> : null}
    </div>
  );
}

/**
 * What was actually looked at. A Report over a truncated Analysis Scope is still
 * valid, but the reader is entitled to know it was sampled.
 */
function ScopeDisclosure({ scope }: { scope: AnalysisScope }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Analysis Scope
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {scope.files_analyzed.toLocaleString()} of {scope.total_files_seen.toLocaleString()}{" "}
        files were analyzed
        {scope.truncated
          ? " — the repository exceeded the analysis cap, so shallower files were kept in preference to deeply-nested ones."
          : ", covering everything left after excluded paths were dropped."}{" "}
        Complexity looked at {scope.python_files_analyzed} Python and {scope.js_files_analyzed}{" "}
        JS/TS files.
      </p>
      {scope.truncated ? (
        <p className="mt-2 inline-block rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
          Sampled — not a complete inspection
        </p>
      ) : null}
    </section>
  );
}
