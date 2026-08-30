import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../components/ui/chart";
import type { CommandRun, DailyStat } from "../types";

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

const runChartConfig = {
  rawEstimatedTokens: { label: "Original", color: "#1d4f6e" },
  outputEstimatedTokens: { label: "Output", color: "#c59232" },
  estimatedTokensSaved: { label: "Saved", color: "#16836f" },
} satisfies ChartConfig;

function completeWeeklyRunSeries(runs: CommandRun[]) {
  const totalsByDate = new Map<string, {
    rawEstimatedTokens: number;
    outputEstimatedTokens: number;
    estimatedTokensSaved: number;
    runs: number;
  }>();
  for (const run of runs) {
    const date = run.createdAt.slice(0, 10);
    const totals = totalsByDate.get(date) ?? {
      rawEstimatedTokens: 0,
      outputEstimatedTokens: 0,
      estimatedTokensSaved: 0,
      runs: 0,
    };
    totals.rawEstimatedTokens += run.rawEstimatedTokens;
    totals.outputEstimatedTokens += run.outputEstimatedTokens;
    totals.estimatedTokensSaved += run.estimatedTokensSaved;
    totals.runs += 1;
    totalsByDate.set(date, totals);
  }

  const latestDate = [...totalsByDate.keys()].sort().at(-1);
  if (!latestDate) return [];
  const end = new Date(`${latestDate}T00:00:00Z`);
  const chartData = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    chartData.push({
      date: key,
      rawEstimatedTokens: 0,
      outputEstimatedTokens: 0,
      estimatedTokensSaved: 0,
      runs: 0,
      ...totalsByDate.get(key),
    });
  }
  return chartData;
}

export function CommandRunChart({ runs }: { runs: CommandRun[] }) {
  const chartData = completeWeeklyRunSeries(runs);

  return (
    <ChartContainer className="h-[300px] w-full" config={runChartConfig}>
      <AreaChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="date"
          interval={0}
          tickFormatter={(value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short" })}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis axisLine={false} domain={[0, "auto"]} tickFormatter={formatTokenAxis} tickLine={false} width={44} />
        <ChartTooltip
          content={<ChartTooltipContent indicator="dashed" labelFormatter={(label, payload) => {
            const runCount = payload[0]?.payload?.runs ?? 0;
            const date = new Date(`${String(label)}T00:00:00Z`).toLocaleDateString();
            return `${date} | ${runCount} ${runCount === 1 ? "run" : "runs"}`;
          }} />}
          cursor={false}
        />
        <Legend content={<ChartLegendContent />} />
        <Area dataKey="rawEstimatedTokens" fill="var(--color-rawEstimatedTokens)" fillOpacity={0.12} stroke="var(--color-rawEstimatedTokens)" type="monotone" />
        <Area dataKey="outputEstimatedTokens" fill="var(--color-outputEstimatedTokens)" fillOpacity={0.12} stroke="var(--color-outputEstimatedTokens)" type="monotone" />
        <Area dataKey="estimatedTokensSaved" fill="var(--color-estimatedTokensSaved)" fillOpacity={0.32} stroke="var(--color-estimatedTokensSaved)" type="monotone" />
      </AreaChart>
    </ChartContainer>
  );
}
