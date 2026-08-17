import Link from "next/link";

import { formatReportDate } from "@/lib/dates";
import { BAND_PRESENTATION, healthScoreBand } from "@/lib/metrics-display";
import { repoLabel } from "@/lib/repo-url";
import type { RecentReport } from "@/lib/reports-repo";

export function RecentReports({ reports }: { reports: RecentReport[] }) {
  if (reports.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No Reports yet. Analyze a repository above and it will show up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {reports.map((report) => (
        <li key={report.id}>
          <Link
            href={`/report/${report.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-900">
                {repoLabel(report.repo_url)}
              </span>
              <span className="block text-xs text-slate-400">
                {formatReportDate(report.created_at)}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                BAND_PRESENTATION[healthScoreBand(report.health_score)].chipClass
              }`}
            >
              {report.health_score}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
