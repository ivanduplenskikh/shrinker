import { formatInteger, formatUsd, type DailyStatsRow } from "../lib/stats";

const WIDTH = 960;
const HEIGHT = 420;
const LEFT = 72;
const RIGHT = 28;
const TOP = 34;
const BOTTOM = 62;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;

function Chart({ daily }: { daily: DailyStatsRow[] }) {
  const maxSaved = Math.max(1, ...daily.map((row) => row.estimatedTokensSaved));
  const points = daily.map((row, index) => ({
    ...row,
    x: daily.length === 1 ? LEFT + PLOT_WIDTH / 2 : LEFT + (index / (daily.length - 1)) * PLOT_WIDTH,
    y: TOP + PLOT_HEIGHT - (row.estimatedTokensSaved / maxSaved) * PLOT_HEIGHT,
  }));
  const labelStride = Math.ceil(daily.length / 8);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Daily estimated tokens saved over the last 30 days"
      className="block h-auto w-full min-w-[620px]"
    >
      <text
        className="fill-[#66727f] text-[12px]"
        x={18}
        y={TOP + PLOT_HEIGHT / 2}
        transform={`rotate(-90 18 ${TOP + PLOT_HEIGHT / 2})`}
      >
        Tokens saved
      </text>

      {Array.from({ length: 5 }, (_, index) => {
        const value = Math.round((maxSaved * (4 - index)) / 4);
        const y = TOP + (index / 4) * PLOT_HEIGHT;
        return (
          <g key={index}>
            <line className="stroke-[#dce3e8]" x1={LEFT} y1={y} x2={WIDTH - RIGHT} y2={y} strokeWidth={1} />
            <text className="fill-[#66727f] text-[12px]" x={LEFT - 12} y={y + 4} textAnchor="end">
              {formatInteger(value)}
            </text>
          </g>
        );
      })}

      <line
        className="stroke-[#9aa9b5]"
        x1={LEFT}
        y1={TOP + PLOT_HEIGHT}
        x2={WIDTH - RIGHT}
        y2={TOP + PLOT_HEIGHT}
        strokeWidth={1}
      />

      <polyline
        fill="none"
        className="stroke-[#2774d9]"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
      />

      {points.map((point) => (
        <circle
          key={point.date}
          className="fill-white stroke-[#2774d9] hover:fill-[#2774d9]"
          cx={point.x}
          cy={point.y}
          r={4}
          strokeWidth={3}
        >
          <title>{`${point.date}: ${formatInteger(point.estimatedTokensSaved)} tokens saved, ${point.runs} runs`}</title>
        </circle>
      ))}

      {points.map((point, index) => {
        const hidden = daily.length > 10 && index % labelStride !== 0 && index !== points.length - 1;
        if (hidden) return null;
        return (
          <text
            key={point.date}
            className="fill-[#66727f] text-[12px]"
            x={point.x}
            y={HEIGHT - 28}
            textAnchor="middle"
          >
            {point.date.slice(5)}
          </text>
        );
      })}

      <text
        className="fill-[#66727f] text-[12px]"
        x={LEFT + PLOT_WIDTH / 2}
        y={HEIGHT - 6}
        textAnchor="middle"
      >
        Date
      </text>
    </svg>
  );
}

interface TrendChartProps {
  daily: DailyStatsRow[];
  costRate: number;
}

export function TrendChart({ daily, costRate }: TrendChartProps) {
  return (
    <section className="overflow-x-auto rounded-lg border border-[#dce3e8] bg-white p-[22px] shadow-[0_8px_24px_#26394d0d]">
      <h2 className="mb-1 text-[18px] font-semibold text-[#17202a]">Tokens saved over time</h2>
      <p className="mb-3.5 text-[#66727f]">
        Estimated savings from recorded command runs. Cost uses {formatUsd(costRate)} per million input
        tokens.
      </p>
      {daily.length === 0 ? (
        <div className="py-10 text-center text-[#66727f]">No recorded runs in the last 30 days.</div>
      ) : (
        <Chart daily={daily} />
      )}
    </section>
  );
}
