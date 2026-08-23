import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import type { StatsSummary } from "./stats-store.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function makeChart(summary: StatsSummary): string {
  const width = 960;
  const height = 420;
  const left = 72;
  const right = 28;
  const top = 34;
  const bottom = 62;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxSaved = Math.max(1, ...summary.daily.map((row) => row.estimatedTokensSaved));
  const points = summary.daily.map((row, index) => {
    const x = summary.daily.length === 1
      ? left + plotWidth / 2
      : left + (index / (summary.daily.length - 1)) * plotWidth;
    const y = top + plotHeight - (row.estimatedTokensSaved / maxSaved) * plotHeight;
    return { ...row, x, y };
  });
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = Math.round((maxSaved * (4 - index)) / 4);
    const y = top + (index / 4) * plotHeight;
    return `<line class="grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" />` +
      `<text class="axis-label" x="${left - 12}" y="${y + 4}" text-anchor="end">${formatInteger(value)}</text>`;
  }).join("");
  const labels = points.map((point, index) => {
    if (summary.daily.length > 10 && index % Math.ceil(summary.daily.length / 8) !== 0 && index !== points.length - 1) return "";
    return `<text class="axis-label" x="${point.x}" y="${height - 28}" text-anchor="middle">${escapeHtml(point.date.slice(5))}</text>`;
  }).join("");
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const dots = points.map((point) =>
    `<circle class="point" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(point.date)}: ${formatInteger(point.estimatedTokensSaved)} tokens saved, ${point.runs} runs</title></circle>`,
  ).join("");

  if (points.length === 0) {
    return `<div class="empty-chart">No recorded runs in the last 30 days.</div>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily estimated tokens saved over the last 30 days">
    <text class="axis-title" x="18" y="${top + plotHeight / 2}" transform="rotate(-90 18 ${top + plotHeight / 2})">Tokens saved</text>
    ${grid}
    <line class="axis" x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" />
    <polyline class="trend" points="${line}" />
    ${dots}
    ${labels}
    <text class="axis-title" x="${left + plotWidth / 2}" y="${height - 6}" text-anchor="middle">Date</text>
  </svg>`;
}

export function defaultDashboardPath(databasePath: string): string {
  return path.join(path.dirname(databasePath), "dashboard.html");
}

export function writeStatsDashboard(summary: StatsSummary, outputPath = defaultDashboardPath(summary.databasePath)): string {
  const filters = summary.byFilter.length === 0
    ? `<p class="muted">No filter data yet.</p>`
    : summary.byFilter.map((row) => `<div class="filter-row"><span>${escapeHtml(row.filterKind)}</span><strong>${formatInteger(row.estimatedTokensSaved)}</strong><small>${row.reductionPercent}% reduction</small></div>`).join("");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shrinker stats dashboard</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232774d9'/%3E%3Cpath d='M16 18h32L38 30H26zM24 34h16l-5 8h-6zM29 46h6v5h-6z' fill='white'/%3E%3C/svg%3E">
<style>
:root { color-scheme: light; --ink: #17202a; --muted: #66727f; --line: #dce3e8; --blue: #2774d9; --blue-soft: #eaf2ff; --green: #16856b; --surface: #ffffff; --background: #f4f7fa; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: var(--background); font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 42px 28px 56px; }
.eyebrow { margin: 0 0 8px; color: var(--blue); font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(28px, 4vw, 44px); letter-spacing: -.03em; }
.subtitle { margin: 8px 0 30px; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; }
.card, .panel { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 8px 24px #26394d0d; }
.card { padding: 18px 20px; }
.card label { display: block; color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.card strong { display: block; margin-top: 6px; font-size: 27px; }
.panel { padding: 22px; }
.panel h2 { margin: 0 0 4px; font-size: 18px; }
.panel p { margin: 0 0 14px; color: var(--muted); }
.chart { overflow: hidden; }
svg { display: block; width: 100%; min-width: 620px; height: auto; }
.chart { overflow-x: auto; }
.grid { stroke: var(--line); stroke-width: 1; }
.axis { stroke: #9aa9b5; stroke-width: 1; }
.axis-label, .axis-title { fill: var(--muted); font-size: 12px; }
.trend { fill: none; stroke: var(--blue); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.point { fill: var(--surface); stroke: var(--blue); stroke-width: 3; }
.point:hover { fill: var(--blue); r: 6; }
.lower { display: grid; grid-template-columns: 1.2fr .8fr; gap: 20px; margin-top: 20px; }
.filter-row { display: grid; grid-template-columns: 1fr auto auto; gap: 18px; align-items: baseline; padding: 11px 0; border-bottom: 1px solid var(--line); }
.filter-row:last-child { border-bottom: 0; }
.filter-row small { color: var(--green); }
.muted { color: var(--muted); }
@media (max-width: 720px) { main { padding: 28px 16px 40px; } .cards, .lower { grid-template-columns: 1fr; } .card strong { font-size: 24px; } }
</style>
</head>
<body>
<main>
  <p class="eyebrow">Local activity</p>
  <h1>Shrinker stats</h1>
  <p class="subtitle">Token reduction over the last 30 days</p>
  <section class="cards">
    <div class="card"><label>All-time saved</label><strong>${formatInteger(summary.total.estimatedTokensSaved)}</strong></div>
    <div class="card"><label>Runs this week</label><strong>${formatInteger(summary.last7Days.runs)}</strong></div>
    <div class="card"><label>Average reduction</label><strong>${summary.total.reductionPercent}%</strong></div>
  </section>
  <section class="panel chart"><h2>Tokens saved over time</h2><p>Estimated savings from recorded command runs.</p>${makeChart(summary)}</section>
  <section class="lower">
    <section class="panel"><h2>By filter</h2><p>Where the savings come from.</p>${filters}</section>
    <section class="panel"><h2>Storage</h2><p>Stats stay on this machine.</p><p class="muted">${escapeHtml(summary.databasePath)}</p></section>
  </section>
</main>
</body>
</html>
`;
  mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  writeFileSync(outputPath, html, "utf8");
  return outputPath;
}

export function openStatsDashboard(outputPath: string): void {
  const platform = process.platform;
  if (platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", outputPath], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }

  const command = platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [outputPath], { detached: true, stdio: "ignore" });
  child.unref();
}

export function serveStatsDashboard(getSummary: () => StatsSummary, port = 4317): Promise<void> {
  const server = createServer((request, response) => {
    if (request.url !== "/") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    try {
      const dashboardPath = writeStatsDashboard(getSummary());
      const html = readFileSync(dashboardPath, "utf8");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Could not render dashboard: ${String(error)}`);
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}`;
      process.stdout.write(`Dashboard server running at ${url}\n`);
      openStatsDashboard(url);
      resolve();
    });
  });
}

export async function startStatsDashboard(port = 4317): Promise<{ pid: number; reused: boolean }> {
  const url = `http://127.0.0.1:${port}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    const body = await response.text();
    if (response.ok && body.includes("Shrinker stats")) {
      openStatsDashboard(url);
      return { pid: 0, reused: true };
    }
  } catch {}

  const child = spawn(
    process.execPath,
    [process.argv[1] ?? "", "stats", "--dashboard", "--dashboard-server", "--port", String(port)],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return { pid: child.pid ?? 0, reused: false };
}
