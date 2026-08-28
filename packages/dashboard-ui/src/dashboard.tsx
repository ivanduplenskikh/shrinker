import { createRoot } from "react-dom/client";
import { Card, Chip, Table } from "@heroui/react";
import "./styles.css";

interface DailyStat { date: string; estimatedTokensSaved: number; }
interface CommandStat { command: string; filterKind: string; calls: number; estimatedTokensSaved: number; reductionPercent: number; }
interface Summary { databasePath: string; total: { runs: number; estimatedTokensSaved: number; reductionPercent: number }; last7Days: { estimatedTokensSaved: number }; daily: DailyStat[]; byCommand: CommandStat[]; }
interface StatsPayload { summary: Summary; }

declare global { interface Window { __SHRINKER_STATS__?: StatsPayload; } }

const emptySummary: Summary = { databasePath: "", total: { runs: 0, estimatedTokensSaved: 0, reductionPercent: 0 }, last7Days: { estimatedTokensSaved: 0 }, daily: [], byCommand: [] };
const summary = (window.__SHRINKER_STATS__ || { summary: emptySummary }).summary;

function formatNumber(value = 0): string { return Number(value).toLocaleString(); }

function TrendChart({ daily }: { daily: DailyStat[] }) {
  const width = 960, height = 300, left = 70, right = width - 30, top = 20, bottom = height - 52;
  const max = Math.max(1, ...daily.map((row) => row.estimatedTokensSaved));
  const x = (index: number) => daily.length === 1 ? left + (right - left) / 2 : left + (right - left) * index / (daily.length - 1);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const line = daily.map((row, index) => `${x(index)},${y(row.estimatedTokensSaved)}`).join(" ");
  const labels = daily.length <= 8 ? daily : daily.filter((_, index) => index === 0 || index === daily.length - 1);
  return <div className="chart-wrap"><svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tokens saved over time">
    {[0, 1, 2, 3, 4].map((tick) => { const value = Math.round(max * tick / 4); const tickY = bottom - (bottom - top) * tick / 4; return <g key={tick}><line className="grid-line" x1={left} x2={right} y1={tickY} y2={tickY} /><text className="axis-label y-label" x={left - 10} y={tickY}>{formatNumber(value)}</text></g>; })}
    <line className="axis-line" x1={left} x2={left} y1={top} y2={bottom} /><line className="axis-line" x1={left} x2={right} y1={bottom} y2={bottom} />
    <text className="axis-title" transform={`translate(16 ${(top + bottom) / 2}) rotate(-90)`}>Tokens saved</text><text className="axis-title" x={(left + right) / 2} y={height - 8}>Date</text>
    {labels.map((row) => <text className="axis-label date-label" key={row.date} x={x(daily.indexOf(row))} y={bottom + 22}>{row.date}</text>)}
    {daily.length > 0 && <polyline className="trend-line" points={line} />}
  </svg></div>;
}

function Dashboard() {
  return <main className="page-shell">
    <header className="page-header"><div><p className="eyebrow">Local activity</p><h1>Shrinker stats</h1><p className="database-path">{summary.databasePath}</p></div><Chip color="success" variant="soft">Local only</Chip></header>
    <section className="summary-grid" aria-label="Summary"><Card><Card.Content><span className="stat-label">Runs</span><strong>{formatNumber(summary.total.runs)}</strong></Card.Content></Card><Card><Card.Content><span className="stat-label">Tokens saved</span><strong>{formatNumber(summary.total.estimatedTokensSaved)}</strong></Card.Content></Card><Card><Card.Content><span className="stat-label">Reduction</span><strong>{summary.total.reductionPercent || 0}%</strong></Card.Content></Card><Card><Card.Content><span className="stat-label">Last 7 days</span><strong>{formatNumber(summary.last7Days.estimatedTokensSaved)}</strong></Card.Content></Card></section>
    <Card className="panel"><Card.Content><div className="section-heading"><div><p className="eyebrow">Trend</p><h2>Tokens saved over time</h2></div><Chip variant="secondary">Daily</Chip></div><TrendChart daily={summary.daily} /></Card.Content></Card>
    <Card className="panel"><Card.Content><div className="section-heading"><div><p className="eyebrow">Command coverage</p><h2>Top commands</h2></div><span className="database-path">Arguments omitted</span></div><Table aria-label="Top commands"><Table.Header><Table.Column>COMMAND</Table.Column><Table.Column>FILTER</Table.Column><Table.Column>RUNS</Table.Column><Table.Column>SAVED</Table.Column><Table.Column>REDUCTION</Table.Column></Table.Header><Table.Body<CommandStat> items={summary.byCommand} renderEmptyState={() => "No command data yet."}>{(row) => <Table.Row id={`${row.command}-${row.filterKind}`}><Table.Cell><code>{row.command}</code></Table.Cell><Table.Cell><Chip size="sm" variant="secondary">{row.filterKind}</Chip></Table.Cell><Table.Cell>{formatNumber(row.calls)}</Table.Cell><Table.Cell>{formatNumber(row.estimatedTokensSaved)}</Table.Cell><Table.Cell>{row.reductionPercent}%</Table.Cell></Table.Row>}</Table.Body></Table></Card.Content></Card>
  </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Dashboard root element is missing");
createRoot(root).render(<Dashboard />);
