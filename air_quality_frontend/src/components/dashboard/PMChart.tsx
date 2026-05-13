import {
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { C } from "./constants";
import { DarkTooltip } from "./DarkTooltip";

export interface PMChartPoint {
  timestamp?: string;
  time: string;
  actual?: number;
  forecast?: number;
}

interface PMChartProps {
  data: PMChartPoint[];
  color: string;
  unit?: string;
  referenceValue?: number;
  referenceLabel?: string;
  height?: number;
  yLabel?: string;
}

/**
 * Single-metric chart: actual values use a solid line, forecast values use a dashed line.
 */
export function PMChart({
  data, color, unit = " µg/m³",
  referenceValue, referenceLabel,
  height = 180, yLabel,
}: PMChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9, fill: C.muted }}
          tickLine={false}
          axisLine={{ stroke: C.border }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: C.muted }}
          tickLine={false}
          axisLine={false}
          width={40}
          label={yLabel ? {
            value: yLabel, angle: -90, position: "insideLeft",
            fontSize: 9, fill: C.muted, offset: 4,
          } : undefined}
        />
        <Tooltip content={<DarkTooltip />} />

        {referenceValue != null && (
          <ReferenceLine
            y={referenceValue}
            stroke={color}
            strokeDasharray="5 3"
            strokeWidth={1}
            label={{ value: referenceLabel ?? String(referenceValue), position: "insideTopRight", fontSize: 8, fill: color }}
          />
        )}

        <Line
          dataKey="actual"
          name="Thực tế"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          unit={unit}
          connectNulls
          isAnimationActive={false}
        />

        <Line
          dataKey="forecast"
          name="Dự báo"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          activeDot={{ r: 3 }}
          unit={unit}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
