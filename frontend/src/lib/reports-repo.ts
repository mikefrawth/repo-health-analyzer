/**
 * Reading and writing Reports.
 *
 * Reads use the anon key (Reports are public); the single write path uses the
 * service role and lives behind /api/analyze.
 */

import { REPORTS_TABLE, publicClient, serviceRoleClient } from "./supabase";
import type { AnalyzeResponse, Report } from "./report";

export type RecentReport = {
  id: string;
  repo_url: string;
  health_score: number;
  created_at: string;
};

/** Persist a freshly-computed analysis as a Report and return its id. */
export async function saveReport(analysis: AnalyzeResponse): Promise<string> {
  const { data, error } = await serviceRoleClient()
    .from(REPORTS_TABLE)
    .insert({
      repo_url: analysis.repo_url,
      metrics: analysis.metrics,
      health_score: analysis.health_score,
      analysis_scope: analysis.analysis_scope,
      // Preserved as null for a Partial Report — a valid Report, not an error.
      ai_summary: analysis.ai_summary,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Could not save Report: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

export async function fetchReport(id: string): Promise<Report | null> {
  // Postgres errors on a malformed uuid, so a junk id is answered as "no such
  // Report" here rather than becoming a 500 further up.
  if (!isReportId(id)) {
    return null;
  }

  const { data, error } = await publicClient()
    .from(REPORTS_TABLE)
    .select("id, repo_url, metrics, health_score, analysis_scope, ai_summary, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load Report: ${error.message}`);
  }
  return (data as Report | null) ?? null;
}

export async function fetchRecentReports(limit = 12): Promise<RecentReport[]> {
  const { data, error } = await publicClient()
    .from(REPORTS_TABLE)
    .select("id, repo_url, health_score, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load recent Reports: ${error.message}`);
  }
  return (data as RecentReport[] | null) ?? [];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReportId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}
