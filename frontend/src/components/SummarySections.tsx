import type { AISummary, AISummaryReason } from "@/lib/report";

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

export function SummarySections({
  summary,
  reason,
}: {
  summary: AISummary | null;
  reason: AISummaryReason | null;
}) {
  if (summary === null) {
    return <PartialReportNotice reason={reason} />;
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
 *
 * Issue #25: `reason` tells apart "never asked" (free tier) from "asked, and
 * it failed" — `null` covers Reports saved before this ticket, which carry
 * no reason and fall back to the older, cause-agnostic wording.
 */
function PartialReportNotice({ reason }: { reason: AISummaryReason | null }) {
  const { heading, body } = NOTICE_COPY[reason ?? "unknown"];
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
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{heading}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">{body}</p>
        </div>
      </div>
    </section>
  );
}

const NOTICE_COPY: Record<AISummaryReason | "unknown", { heading: string; body: string }> = {
  skipped_free_tier: {
    heading: "AI summary not included — this is a Partial Report",
    body:
      "The AI Summary is part of a detailed Report, which spends one of your monthly " +
      "credits. This one used the free plan, so only the Health Score, Metrics, and " +
      "Analysis Scope below were generated — all measured normally and unaffected: the " +
      "summary never contributes to the score.",
  },
  failed: {
    heading: "AI summary failed to generate — this is a Partial Report",
    body:
      "Generation was attempted but didn't come back successfully, so this Report " +
      "doesn't have a written summary. The credit it would have spent was refunded. " +
      "Everything above — the Health Score, the Metrics it was computed from, and the " +
      "Analysis Scope — was measured normally and is unaffected.",
  },
  unknown: {
    heading: "AI summary unavailable — this is a Partial Report",
    body:
      "The written summary couldn't be generated, so this Report doesn't have one. " +
      "Everything above — the Health Score, the Metrics it was computed from, and the " +
      "Analysis Scope — was measured normally and is unaffected: the summary never " +
      "contributes to the score.",
  },
};
