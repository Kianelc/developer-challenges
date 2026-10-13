import { useMemo } from "react";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Reading } from "@full-stack-solution/shared";
import { formatNumber, formatTimeOfDay, formatTimestamp } from "@web/utils/format";

export interface ReadingsChartProps {
  readings: Reading[];
  height?: number;
}

/**
 * Line chart of a raw time series.
 *
 * `ResponsiveContainer` makes it follow its parent width, which is what keeps
 * the chart readable from phone to desktop.
 */
export function ReadingsChart({ readings, height = 320 }: ReadingsChartProps) {
  const theme = useTheme();

  // Readings arrive sorted by timestamp from the API; mapping once avoids
  // re-creating the dataset on every render.
  const data = useMemo(
    () =>
      readings.map((reading) => ({
        timestamp: reading.timestamp,
        value: reading.value,
      })),
    [readings],
  );

  return (
    <Box sx={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => formatTimeOfDay(String(value))}
            stroke={theme.palette.text.secondary}
            fontSize={12}
            minTickGap={24}
          />
          <YAxis
            stroke={theme.palette.text.secondary}
            fontSize={12}
            tickFormatter={(value) => formatNumber(Number(value), 1)}
          />
          <Tooltip
            labelFormatter={(label) =>
              formatTimestamp(typeof label === "string" ? label : null)
            }
            formatter={(value) => [formatNumber(Number(value), 3), "Value"]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={theme.palette.primary.main}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
