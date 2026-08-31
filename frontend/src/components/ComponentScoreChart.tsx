"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { componentScoreChartData, type ComponentScoreDatum } from "@/lib/metrics-display";
import type { ComponentScores, ComponentWeights } from "@/lib/report";

const MEASURED_FILL = "#1d4ed8";
const UNMEASURED_PATTERN_ID = "component-score-unmeasured-hatch";

export function ComponentScoreChart({
  componentScores,
  componentWeights,
}: {
  componentScores: ComponentScores;
  componentWeights: ComponentWeights;
}) {
  const data = componentScoreChartData(componentScores, componentWeights);
  const maxWeight = Math.max(...Object.values(componentWeights));

  return (
    <div style={{ height: Math.max(140, data.length * 38 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
        >
          <defs>
            {/* The "not measured" bars get a hatch fill instead of a solid
                colour, so a missing Component Score never reads as a score
                of zero (CONTEXT.md's Component Score entry). */}
            <pattern
              id={UNMEASURED_PATTERN_ID}
              width={6}
              height={6}
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <rect width={6} height={6} fill="#e2e8f0" />
              <line x1={0} y1={0} x2={0} y2={6} stroke="#cbd5e1" strokeWidth={3} />
            </pattern>
          </defs>
          <CartesianGrid horizontal={false} stroke="#f1f5f9" />
          <XAxis
            type="number"
            domain={[0, maxWeight]}
            allowDecimals={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fill: "#475569", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "#f8fafc" }}
            // Reads `points`, not the charted value: an unmeasured row draws a
            // stub bar, and quoting that stub back as a number would be the
            // very claim the stub exists to avoid making.
            formatter={(_value: number, _name, item) => {
              const datum = item.payload as ComponentScoreDatum;
              return datum.measured
                ? [datum.points.toFixed(1), "Weighted score"]
                : ["Not measured", "Weighted score"];
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Bar dataKey="barValue" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.measured ? MEASURED_FILL : `url(#${UNMEASURED_PATTERN_ID})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
