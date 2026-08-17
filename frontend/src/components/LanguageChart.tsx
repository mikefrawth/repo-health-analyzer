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

import { languageChartData } from "@/lib/metrics-display";

// Sequential, single-hue: these bars encode one quantity, not categories, so
// varying only lightness keeps the largest bar reading as the largest.
const BAR_SHADES = ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"];

export function LanguageChart({ breakdown }: { breakdown: Record<string, number> }) {
  const data = languageChartData(breakdown);

  if (data.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No language breakdown was recorded for this Target Repository.
      </p>
    );
  }

  return (
    <div style={{ height: Math.max(140, data.length * 38 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="#f1f5f9" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="language"
            width={92}
            tick={{ fill: "#475569", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "#f8fafc" }}
            formatter={(value: number) => [`${value} files`, "Analyzed"]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Bar dataKey="files" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((entry, index) => (
              <Cell
                key={entry.language}
                fill={BAR_SHADES[Math.min(index, BAR_SHADES.length - 1)]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
