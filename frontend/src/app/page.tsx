import { AnalyzeForm } from "@/components/AnalyzeForm";
import { RecentReports } from "@/components/RecentReports";
import { fetchRecentReports, type RecentReport } from "@/lib/reports-repo";

/**
 * Always rendered fresh: a Report created a moment ago must appear in the list
 * when the user comes back to this page, without them having to hard-refresh.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let reports: RecentReport[] = [];
  let listUnavailable = false;

  try {
    reports = await fetchRecentReports();
  } catch (error) {
    // A missing or misconfigured Supabase project shouldn't take the whole page
    // down — the form is still the point of it.
    console.error("[home] could not load recent Reports:", error);
    listUnavailable = true;
  }

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          How healthy is that repository?
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
          Paste a public GitHub repository URL. You&apos;ll get a deterministic Health
          Score, the Metrics behind it, and a plain-language read on what they mean.
        </p>
        <div className="mt-6 max-w-2xl">
          <AnalyzeForm />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent Reports
        </h2>
        <div className="mt-3">
          {listUnavailable ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Recent Reports couldn&apos;t be loaded. Check the Supabase environment
              variables in <code className="font-mono text-xs">frontend/.env.local</code>.
            </p>
          ) : (
            <RecentReports reports={reports} />
          )}
        </div>
      </section>
    </div>
  );
}
