import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../components/ui/chart";
import type { CommandRun } from "../types";

export type TimelineRange = "day" | "week" | "month" | "year";

function formatTokenAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return String(value);
}

const runChartConfig = {
  rawEstimatedTokens: { label: "Original", color: "#1d4f6e" },
  outputEstimatedTokens: { label: "Output", color: "#c59232" },
  estimatedTokensSaved: { label: "Saved", color: "#16836f" },
} satisfies ChartConfig;

interface TimelinePoint {
  label: string;
  rawEstimatedTokens: number;
  outputEstimatedTokens: number;
  estimatedTokensSaved: number;
  runs: number;
}

function startOfWeek(today: Date): Date {
  const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
  };
  const firstDay = locale.getWeekInfo?.().firstDay ?? 1;
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() - (firstDay % 7) + 7) % 7));
  return start;
}

function makeTimeline(range: TimelineRange, today: Date): { start: Date; points: TimelinePoint[] } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const points: TimelinePoint[] = [];
  const addPoint = (label: string) => points.push({ label, rawEstimatedTokens: 0, outputEstimatedTokens: 0, estimatedTokensSaved: 0, runs: 0 });

  if (range === "day") {
    for (let hour = 0; hour < 24; hour += 1) addPoint(`${String(hour).padStart(2, "0")}:00`);
  } else if (range === "week") {
    const weekStart = startOfWeek(start);
    start.setTime(weekStart.getTime());
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      addPoint(date.toLocaleDateString(undefined, { weekday: "short" }));
    }
  } else if (range === "month") {
    start.setDate(1);
    const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) addPoint(String(day));
  } else {
    start.setMonth(0, 1);
    for (let month = 0; month < 12; month += 1) {
      addPoint(new Date(start.getFullYear(), month, 1).toLocaleDateString(undefined, { month: "short" }));
    }
  }
  return { start, points };
}

function completeRunSeries(runs: CommandRun[], range: TimelineRange): TimelinePoint[] {
  const { start, points } = makeTimeline(range, new Date());
  const end = new Date(start);
  if (range === "day") end.setDate(end.getDate() + 1);
  else if (range === "week") end.setDate(end.getDate() + 7);
  else if (range === "month") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);

  for (const run of runs) {
    const timestamp = new Date(`${run.createdAt.replace(" ", "T")}Z`);
    if (timestamp < start || timestamp >= end) continue;
    const index = range === "day" ? timestamp.getHours()
      : range === "week" ? Math.floor((new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate()).getTime() - start.getTime()) / 86_400_000)
        : range === "month" ? timestamp.getDate() - 1
          : timestamp.getMonth();
    const point = points[index];
    point.rawEstimatedTokens += run.rawEstimatedTokens;
    point.outputEstimatedTokens += run.outputEstimatedTokens;
    point.estimatedTokensSaved += run.estimatedTokensSaved;
    point.runs += 1;
  }
  return points;
}

export function CommandRunChart({ runs, range }: { runs: CommandRun[]; range: TimelineRange }) {
  const chartData = completeRunSeries(runs, range);

  return (
    <ChartContainer className="h-[300px] w-full" config={runChartConfig}>
      <AreaChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          interval={0}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis axisLine={false} domain={[0, "auto"]} tickFormatter={formatTokenAxis} tickLine={false} width={44} />
        <ChartTooltip
          content={<ChartTooltipContent indicator="dashed" labelFormatter={(label, payload) => {
            const runCount = payload[0]?.payload?.runs ?? 0;
            return `${String(label)} | ${runCount} ${runCount === 1 ? "run" : "runs"}`;
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
