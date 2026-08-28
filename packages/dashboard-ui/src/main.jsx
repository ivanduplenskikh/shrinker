import React from "react";
import { createRoot } from "react-dom/client";
import { Card, CardBody, Chip, HeroUIProvider, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import "./styles.css";

const stats = window.__SHRINKER_STATS__ || { summary: { total: {}, last7Days: {}, daily: [], byCommand: [] } };
const summary = stats.summary;

function formatNumber(value = 0) {
  return Number(value).toLocaleString();
}

function TrendChart({ daily }) {
  const width = 960;
  const height = 300;
  const left = 70;
  const right = width - 30;
  const top = 20;
  const bottom = height - 52;
  const max = Math.max(1, ...daily.map((row) => row.estimatedTokensSaved));
  const x = (index) => daily.length === 1 ? left + (right - left) / 2 : left + (right - left) * index / (daily.length - 1);
  const y = (value) => bottom - value / max * (bottom - top);
  const line = daily.map((row, index) => `${x(index)},${y(row.estimatedTokensSaved)}`).join(" ");
  const labels = daily.length <= 8 ? daily : daily.filter((_, index) => index === 0 || index === daily.length - 1);

  return (
    <div className="chart-wrap">
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tokens saved over time">
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = Math.round(max * tick / 4);
          const tickY = bottom - (bottom - top) * tick / 4;
          return <g key={tick}><line className="grid-line" x1={left} x2={right} y1={tickY} y2={tickY} /><text className="axis-label y-label" x={left - 10} y={tickY}>{formatNumber(value)}</text></g>;
        })}
        <line className="axis-line" x1={left} x2={left} y1={top} y2={bottom} />
        <line className="axis-line" x1={left} x2={right} y1={bottom} y2={bottom} />
        <text className="axis-title" transform={`translate(16 ${(top + bottom) / 2}) rotate(-90)`}>Tokens saved</text>
        <text className="axis-title" x={(left + right) / 2} y={height - 8}>Date</text>
        {labels.map((row) => {
          const index = daily.indexOf(row);
          return <text className="axis-label date-label" key={row.date} x={x(index)} y={bottom + 22}>{row.date}</text>;
        })}
        {daily.length > 0 && <polyline className="trend-line" points={line} />}
      </svg>
    </div>
  );
}

function Dashboard() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Local activity</p>
          <h1>Shrinker stats</h1>
          <p className="database-path">{summary.databasePath}</p>
        </div>
        <Chip color="success" variant="flat">Local only</Chip>
      </header>
      <section className="summary-grid" aria-label="Summary">
        <Card><CardBody><span className="stat-label">Runs</span><strong>{formatNumber(summary.total.runs)}</strong></CardBody></Card>
        <Card><CardBody><span className="stat-label">Tokens saved</span><strong>{formatNumber(summary.total.estimatedTokensSaved)}</strong></CardBody></Card>
        <Card><CardBody><span className="stat-label">Reduction</span><strong>{summary.total.reductionPercent || 0}%</strong></CardBody></Card>
        <Card><CardBody><span className="stat-label">Last 7 days</span><strong>{formatNumber(summary.last7Days.estimatedTokensSaved)}</strong></CardBody></Card>
      </section>
      <Card className="panel"><CardBody><div className="section-heading"><div><p className="eyebrow">Trend</p><h2>Tokens saved over time</h2></div><Chip variant="bordered">Daily</Chip></div><TrendChart daily={summary.daily || []} /></CardBody></Card>
      <Card className="panel"><CardBody><div className="section-heading"><div><p className="eyebrow">Command coverage</p><h2>Top commands</h2></div><span className="database-path">Arguments omitted</span></div><Table aria-label="Top commands" removeWrapper><TableHeader><TableColumn>COMMAND</TableColumn><TableColumn>FILTER</TableColumn><TableColumn>RUNS</TableColumn><TableColumn>SAVED</TableColumn><TableColumn>REDUCTION</TableColumn></TableHeader><TableBody emptyContent="No command data yet.">{(summary.byCommand || []).map((row) => <TableRow key={`${row.command}-${row.filterKind}`}><TableCell><code>{row.command}</code></TableCell><TableCell><Chip size="sm" variant="flat">{row.filterKind}</Chip></TableCell><TableCell>{formatNumber(row.calls)}</TableCell><TableCell>{formatNumber(row.estimatedTokensSaved)}</TableCell><TableCell>{row.reductionPercent}%</TableCell></TableRow>)}</TableBody></Table></CardBody></Card>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<HeroUIProvider><Dashboard /></HeroUIProvider>);
