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

import { COMPONENTS, componentScoreChartData } from "@/lib/metrics-display";
import type { ComponentScores } from "@/lib/report";

const MEASURED_FILL = "#1d4ed8";
const UNMEASURED_PATTERN_ID = "component-score-unmeasured-hatch";
const MAX_WEIGHT = Math.max(...Object.values(COMPONENTS).map((c) => c.weight));

export function ComponentScoreChart({ componentScores }: { componentScores: ComponentScores }) {
  const data = componentScoreChartData(componentScores);

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
            domain={[0, MAX_WEIGHT]}
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
            formatter={(value: number, _name, item) =>
              item.payload.measured
                ? [`${value.toFixed(1)} pts`, "Contribution"]
                : ["Not measured", "Contribution"]
            }
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Bar dataKey="points" radius={[0, 4, 4, 0]} maxBarSize={22}>
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
