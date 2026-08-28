import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
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

export function TrendChart({ daily }: { daily: DailyStat[] }) {
  return (
    <ChartContainer className="h-[300px] w-full" config={chartConfig}>
      <AreaChart
        accessibilityLayer
        data={daily}
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
        <ChartTooltip
          content={<ChartTooltipContent indicator="line" />}
          cursor={false}
        />
        <Area
          dataKey="estimatedTokensSaved"
          fill="var(--color-estimatedTokensSaved)"
          fillOpacity={0.35}
          stroke="var(--color-estimatedTokensSaved)"
          type="natural"
        />
      </AreaChart>
    </ChartContainer>
  );
}
