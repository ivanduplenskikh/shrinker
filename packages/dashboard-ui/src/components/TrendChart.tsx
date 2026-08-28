import type { DailyStat } from "../types";

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

export function TrendChart({ daily }: { daily: DailyStat[] }) {
  const width = 960,
    height = 300,
    left = 70,
    right = width - 30,
    top = 20,
    bottom = height - 52;
  const max = Math.max(1, ...daily.map((row) => row.estimatedTokensSaved));
  const x = (index: number) =>
    daily.length === 1
      ? left + (right - left) / 2
      : left + ((right - left) * index) / (daily.length - 1);
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  const line = daily.map((row, index) => `${x(index)},${y(row.estimatedTokensSaved)}`).join(" ");
  const labels =
    daily.length <= 8
      ? daily
      : daily.filter((_, index) => index === 0 || index === daily.length - 1);

  return (
    <div className="chart-wrap">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Tokens saved over time"
      >
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = Math.round((max * tick) / 4);
          const tickY = bottom - ((bottom - top) * tick) / 4;
          return (
            <g key={tick}>
              <line className="grid-line" x1={left} x2={right} y1={tickY} y2={tickY} />
              <text className="axis-label y-label" x={left - 10} y={tickY}>
                {formatNumber(value)}
              </text>
            </g>
          );
        })}
        <line className="axis-line" x1={left} x2={left} y1={top} y2={bottom} />
        <line className="axis-line" x1={left} x2={right} y1={bottom} y2={bottom} />
        <text className="axis-title" transform={`translate(16 ${(top + bottom) / 2}) rotate(-90)`}>
          Tokens saved
        </text>
        <text className="axis-title" x={(left + right) / 2} y={height - 8}>
          Date
        </text>
        {labels.map((row) => (
          <text
            className="axis-label date-label"
            key={row.date}
            x={x(daily.indexOf(row))}
            y={bottom + 22}
          >
            {row.date}
          </text>
        ))}
        {daily.length > 0 && <polyline className="trend-line" points={line} />}
      </svg>
    </div>
  );
}
