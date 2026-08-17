import type { AISummary } from "@/lib/report";

const SECTIONS = [
  {
    key: "strengths",
    title: "Strengths",
    blurb: "What this repository does well",
    accent: "border-emerald-200 bg-emerald-50",
    marker: "text-emerald-600",
  },
  {
    key: "risks",
    title: "Risks",
    blurb: "What threatens its health",
    accent: "border-rose-200 bg-rose-50",
    marker: "text-rose-600",
  },
  {
    key: "suggestions",
    title: "Suggestions",
    blurb: "What would improve it",
    accent: "border-sky-200 bg-sky-50",
    marker: "text-sky-600",
  },
] as const;

export function SummarySections({ summary }: { summary: AISummary | null }) {
  if (summary === null) {
    return <PartialReportNotice />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {SECTIONS.map((section) => {
        const items = summary[section.key];
        return (
          <section
            key={section.key}
            className={`rounded-xl border p-5 ${section.accent}`}
          >
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              {section.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{section.blurb}</p>
            {items.length === 0 ? (
              <p className="mt-4 text-sm italic text-slate-500">
                Nothing recorded in this category.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {items.map((item, index) => (
                  <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                    <span aria-hidden className={`select-none font-bold ${section.marker}`}>
                      •
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The Partial Report state.
 *
 * Deliberately informational, not a warning: a Partial Report is a complete,
 * valid Report (CONTEXT.md), so this is styled as a neutral note rather than
 * the amber-and-exclamation-mark treatment that would read as a failure. It is
 * still stated outright rather than left as a blank space — the reader needs to
 * know the narrative is absent, just not to be alarmed by it.
 */
function PartialReportNotice() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600"
        >
          i
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            AI summary unavailable — this is a Partial Report
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
            The written summary couldn&apos;t be generated, so this Report doesn&apos;t
            have one. Everything above — the Health Score, the Metrics it was computed
            from, and the Analysis Scope — was measured normally and is unaffected: the
            summary never contributes to the score.
          </p>
        </div>
      </div>
    </section>
  );
}
