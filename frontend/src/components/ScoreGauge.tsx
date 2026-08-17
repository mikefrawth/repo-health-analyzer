import { BAND_PRESENTATION, healthScoreBand } from "@/lib/metrics-display";

// A semicircle of radius 80 drawn from (20,100) to (180,100).
const ARC = "M 20 100 A 80 80 0 0 1 180 100";
const ARC_LENGTH = Math.PI * 80;

export function ScoreGauge({ score }: { score: number }) {
  const { label, color } = BAND_PRESENTATION[healthScoreBand(score)];
  const bounded = Math.max(0, Math.min(100, score));
  const filled = (bounded / 100) * ARC_LENGTH;

  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 118"
        className="w-56"
        role="img"
        aria-label={`Health Score ${score} out of 100 — ${label}`}
      >
        <path d={ARC} fill="none" stroke="#e2e8f0" strokeWidth={16} strokeLinecap="round" />
        <path
          d={ARC}
          fill="none"
          stroke={color}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${ARC_LENGTH}`}
        />
        <text
          x="100"
          y="92"
          textAnchor="middle"
          className="fill-slate-900"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          {score}
        </text>
      </svg>
      <figcaption className="-mt-1 text-center">
        <span className="text-sm font-semibold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
        <span className="block text-xs text-slate-400">Health Score, 0–100</span>
      </figcaption>
    </figure>
  );
}
