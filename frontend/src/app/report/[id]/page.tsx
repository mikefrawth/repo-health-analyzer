import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricsPanel } from "@/components/MetricsPanel";
import { ReportVisibilityControl } from "@/components/ReportVisibilityControl";
import { ScoreGauge } from "@/components/ScoreGauge";
import { SummarySections } from "@/components/SummarySections";
import { formatReportDate } from "@/lib/dates";
import { canBeMadePublic, isPartialReport } from "@/lib/report";
import { repoLabel } from "@/lib/repo-url";
import { fetchReport } from "@/lib/reports-repo";
import { currentUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: { id: string } }) {
  const report = await fetchReport(params.id);
  if (!report) {
    notFound();
  }

  const user = await currentUser();
  const isOwner = user !== null && user.id === report.owner_id;

  return (
    <article className="space-y-8">
      <header className="flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/"
            className="text-sm text-slate-500 transition-colors hover:text-slate-900"
          >
            ← All Reports
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900">
            {repoLabel(report.repo_url)}
          </h1>
          <a
            href={report.repo_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block truncate font-mono text-xs text-slate-400 transition-colors hover:text-slate-600"
          >
            {report.repo_url}
          </a>
          <p className="mt-2 text-xs text-slate-400">
            Analyzed {formatReportDate(report.created_at)}
            {isPartialReport(report) ? " · Partial Report" : ""}
          </p>
          {isOwner ? (
            <ReportVisibilityControl
              reportId={report.id}
              isPublic={report.is_public}
              canBeMadePublic={canBeMadePublic(report)}
            />
          ) : null}
        </div>
        <ScoreGauge score={report.health_score} />
      </header>

      <MetricsPanel
        metrics={report.metrics}
        scope={report.analysis_scope}
        componentScores={report.component_scores}
        componentWeights={report.component_weights}
      />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Summary
        </h2>
        <SummarySections summary={report.ai_summary} reason={report.ai_summary_reason} />
      </section>
    </article>
  );
}
