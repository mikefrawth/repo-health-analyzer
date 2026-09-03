/**
 * Reading and writing Reports.
 *
 * `fetchReport` goes through the session-aware client — a Report may now be
 * private to its owner (issue #22), and only that client resolves `auth.uid()`
 * for the visitor making the request. The single write path uses the service
 * role and lives behind /api/analyze; the visibility toggle is the one other
 * write, and goes through the session-aware client instead so RLS enforces
 * "owner only" a second time, independent of application code.
 */

import { REPORTS_TABLE, publicClient, serviceRoleClient } from "./supabase";
import { serverClient } from "./supabase-server";
import type { AnalyzeResponse, Report } from "./report";

export type RecentReport = {
  id: string;
  repo_url: string;
  health_score: number;
  created_at: string;
};

const REPORT_COLUMNS =
  "id, repo_url, metrics, health_score, analysis_scope, component_scores, component_weights, " +
  "ai_summary, created_at, owner_id, is_public, source_repo_was_private";

/**
 * Persist a freshly-computed Report and return its id.
 *
 * `ownerId` is the signed-in visitor who requested the analysis, or `null`
 * for an anonymous request — which stays public with no owner, matching the
 * app's original behaviour. An owned Report defaults to private.
 */
export async function saveReport(
  analyzed: AnalyzeResponse,
  ownerId: string | null,
): Promise<string> {
  const { data, error } = await serviceRoleClient()
    .from(REPORTS_TABLE)
    .insert({
      repo_url: analyzed.repo_url,
      metrics: analyzed.metrics,
      health_score: analyzed.health_score,
      analysis_scope: analyzed.analysis_scope,
      component_scores: analyzed.component_scores,
      component_weights: analyzed.component_weights,
      // Preserved as null for a Partial Report — a valid Report, not an error.
      ai_summary: analyzed.ai_summary,
      owner_id: ownerId,
      is_public: ownerId === null,
      source_repo_was_private: analyzed.private,
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

  const { data, error } = await serverClient()
    .from(REPORTS_TABLE)
    .select(REPORT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load Report: ${error.message}`);
  }
  return (data as Report | null) ?? null;
}

/** Postgres's code for a violated `check` constraint — here, migration 0005's
 * "a private-repo-sourced Report can't be public" rule. */
const CHECK_VIOLATION = "23514";

/**
 * Flip a Report the caller owns to public. Goes through the session-aware
 * client so RLS's owner-only UPDATE policy (migration 0005) enforces
 * ownership independent of this function, and its check constraint rejects a
 * private-repo-sourced Report regardless of who asks.
 *
 * Returns whether the row is now public — `false` covers "not the owner" and
 * "doesn't exist" (RLS matches zero rows, no error) as well as "source repo
 * was private" (the check constraint raises, caught and treated the same way
 * here — the caller doesn't need to distinguish "not allowed" from "not yours").
 */
export async function makeReportPublic(id: string): Promise<boolean> {
  const { data, error } = await serverClient()
    .from(REPORTS_TABLE)
    .update({ is_public: true })
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === CHECK_VIOLATION) {
      return false;
    }
    throw new Error(`Could not update Report visibility: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
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
