/**
 * The Report domain types, mirroring the backend's wire models
 * (backend/app/models.py). Vocabulary follows CONTEXT.md.
 */

export type ComplexitySignal = {
  language: "python" | "javascript";
  /**
   * `maintainability` is radon's MI (0-100, higher is better).
   * `avg_cyclomatic` is mean per-function cyclomatic complexity (lower is better).
   */
  kind: "maintainability" | "avg_cyclomatic";
  value: number;
  files_analyzed: number;
};

export type Metrics = {
  file_count: number;
  /** `null` means no manifest was found — unmeasurable, NOT zero dependencies. */
  dependency_count: number | null;
  has_tests: boolean;
  has_ci: boolean;
  has_readme: boolean;
  last_commit_days_ago: number | null;
  commits_in_window: number;
  language_breakdown: Record<string, number>;
  primary_language: string | null;
  /** Absent when the Target Repository's language has no supported analyzer. */
  complexity: ComplexitySignal | null;
};

export type AnalysisScope = {
  total_files_seen: number;
  files_analyzed: number;
  truncated: boolean;
  python_files_analyzed: number;
  js_files_analyzed: number;
};

export type AISummary = {
  strengths: string[];
  risks: string[];
  suggestions: string[];
};

/** The backend's `POST /analyze` response body. */
export type AnalyzeResponse = {
  repo_url: string;
  metrics: Metrics;
  health_score: number;
  analysis_scope: AnalysisScope;
  /** `null` is a Partial Report — a complete, valid Report, not an error. */
  ai_summary: AISummary | null;
};

/** A Report as stored in, and read back from, Supabase. */
export type Report = AnalyzeResponse & {
  id: string;
  created_at: string;
};

/** A Report whose Metrics and Health Score survived but whose AI Summary did not. */
export function isPartialReport(report: Pick<Report, "ai_summary">): boolean {
  return report.ai_summary === null;
}
