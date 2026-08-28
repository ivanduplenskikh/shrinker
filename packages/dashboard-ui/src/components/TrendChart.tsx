import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../components/ui/chart";
import type { DailyStat } from "../types";

const chartConfig = {
  estimatedTokensSaved: {
    label: "Tokens saved",
    color: "#16836f",
  },
} satisfies ChartConfig;

function completeDailySeries(daily: DailyStat[]): DailyStat[] {
  if (daily.length === 0) return [];

  const valuesByDate = new Map(daily.map((row) => [row.date, row.estimatedTokensSaved]));
  const dates = [...valuesByDate.keys()].sort();
  const start = new Date(`${dates[0]}T00:00:00Z`);
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  const completeSeries: DailyStat[] = [];

  for (let date = start; date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    completeSeries.push({ date: key, estimatedTokensSaved: valuesByDate.get(key) ?? 0 });
  }

  return completeSeries;
}

function formatTokenAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return String(value);
}

export function TrendChart({ daily }: { daily: DailyStat[] }) {
  const chartData = completeDailySeries(daily);

  return (
    <ChartContainer className="h-[300px] w-full" config={chartConfig}>
      <AreaChart
        accessibilityLayer
        data={chartData}
        margin={{ left: 12, right: 12 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="date"
          tickFormatter={(value: string) => value.slice(5)}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          domain={[0, "auto"]}
          tickFormatter={formatTokenAxis}
          tickLine={false}
          width={44}
        />
        <ChartTooltip
          content={<ChartTooltipContent indicator="line" />}
          cursor={false}
        />
        <Area
          dataKey="estimatedTokensSaved"
          fill="var(--color-estimatedTokensSaved)"
          fillOpacity={0.35}
          stroke="var(--color-estimatedTokensSaved)"
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
}
