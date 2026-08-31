# Repo Health Analyzer

Analyzes a public GitHub repository and produces a saved, shareable Report combining objective code Metrics with an AI-generated qualitative summary.

## Language

**Target Repository**:
The public GitHub repository a user submits for analysis, identified by its URL.
_Avoid_: Repo (too ambiguous with this project's own repo), project, codebase

**Report**:
The saved, immutable result of analyzing a Target Repository at a point in time: its Health Score, Metrics, and AI Summary (or Partial Report state if the AI Summary failed). Addressable at a shareable URL.
_Avoid_: Analysis, result, scan

**Partial Report**:
A Report saved with Metrics and a Health Score but no AI Summary, because the AI Summary could not be generated. Still a complete, valid Report — not an error state.
_Avoid_: Failed report, incomplete report

**Metrics**:
The objective, deterministically-computed measurements of a Target Repository: file count, dependency count, presence of tests, presence of CI configuration, presence of a README, commit recency, and — where applicable — Complexity Signals. Metrics alone are sufficient to compute a Health Score.
_Avoid_: Stats, data, analysis results

**Health Score**:
A 0–100 score computed deterministically from Metrics via a fixed formula. Never produced or altered by the AI Summary step — the same Metrics always yield the same Health Score. Bounded by a confidence cap: a Target Repository with components it was not possible to measure cannot reach 100, however well it scores on what could be measured. See [ADR-0003](docs/adr/0003-health-score-activity-window-and-confidence-cap.md).
_Avoid_: Grade, rating, quality score

**Complexity Signal**:
A per-language measurement of code complexity/maintainability derived from a Target Repository's source files, feeding into the Health Score as one weighted Metric. Only computed for languages with a supported analyzer (currently Python and JS/TS); absent otherwise.
_Avoid_: Complexity score, maintainability index (too tool-specific — that's an implementation detail of how the Python Complexity Signal happens to be computed)

**Analysis Scope**:
The bounded subset of a Target Repository's files actually examined for Metrics and Complexity Signals, after excluded paths are dropped and any remaining excess is truncated to the analysis cap. A Target Repository larger than the cap is still analyzable — just over a reduced Analysis Scope, which the Report discloses.
_Avoid_: File list, scanned files

**AI Summary**:
The qualitative narrative generated for a Report: three Strengths, three Risks, and three Suggestions, written from the Metrics and Analysis Scope. Never the source of the Health Score.
_Avoid_: AI analysis, LLM output, commentary

**Strength / Risk / Suggestion**:
The three fixed categories of qualitative observation that make up an AI Summary — respectively, what the Target Repository does well, what threatens its health, and what would improve it.

**Component Score**:
One of the per-category 0.0–1.0 measurements (tests, CI, README, commit recency, commit activity, dependency hygiene, complexity) that the Health Score formula weights and combines. A component with no measurable value (e.g. no Complexity Signal) has no Component Score at all — never a `0.0` — and is dropped from the formula's renormalization rather than counted against the Target Repository.
_Avoid_: metric score, sub-score, component metric

**Component Weight**:
The fixed integer weight the Health Score formula assigns to each of the seven Component Score categories, controlling how much that category contributes to the total. Always all seven keys — unlike Component Score, never dropped for an unmeasured category. Carried through `AnalyzeResponse` and stored on each Report row alongside its Component Scores, so a Report stays self-describing even if the formula is reweighted later. See [ADR-0006](docs/adr/0006-reports-table-includes-component-weights.md).
_Avoid_: weight literal, formula weight
