import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getInputCostPerMillionTokens, type DailyStatsRow, type StatsSummary } from "./stats-store.js";

const execFileAsync = promisify(execFile);

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

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function makeSavingsHeatmap(rows: DailyStatsRow[]): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 364);
  const dailySavings = new Map(rows.map((row) => [row.date, row.estimatedTokensSaved]));
  const values = rows.map((row) => row.estimatedTokensSaved).filter((value) => value > 0);
  const maxSaved = Math.max(1, ...values);
  const leadingCells = Array.from({ length: start.getUTCDay() }, () =>
    `<span class="heatmap-cell heatmap-empty" aria-hidden="true"></span>`,
  ).join("");
  const cells = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateKey = utcDateKey(date);
    const saved = dailySavings.get(dateKey) ?? 0;
    const level = saved === 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((saved / maxSaved) * 4)));
    return `<span class="heatmap-cell heatmap-level-${level}" title="${dateKey}: ${formatInteger(saved)} estimated tokens saved" aria-label="${dateKey}: ${formatInteger(saved)} estimated tokens saved"></span>`;
  }).join("");
  const totalSaved = rows.reduce((total, row) => total + row.estimatedTokensSaved, 0);

  return `<section class="panel savings-activity"><div class="panel-heading"><div><h2>Savings activity</h2><p>${formatInteger(totalSaved)} estimated tokens saved in the last year.</p></div><div class="heatmap-legend" aria-label="Savings intensity"><span>Less</span><i class="heatmap-level-0"></i><i class="heatmap-level-1"></i><i class="heatmap-level-2"></i><i class="heatmap-level-3"></i><i class="heatmap-level-4"></i><span>More</span></div></div><div class="heatmap-wrap"><div class="heatmap-weekdays" aria-hidden="true"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div><div class="heatmap-grid" role="img" aria-label="Daily estimated token savings over the last 365 days">${leadingCells}${cells}</div></div></section>`;
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
  const inputCostPerMillionTokens = getInputCostPerMillionTokens();
  const averageCostSavedUsd = summary.total.runs === 0
    ? 0
    : summary.total.estimatedInputCostSavedUsd / summary.total.runs;
  const tableHead = (first: string, second: string, third: string): string =>
    `<div class="filter-row filter-head"><span>${first}</span><strong>${second}</strong><small>${third}</small></div>`;
  const filters = summary.byFilter.length === 0
    ? `<p class="muted">No filter data yet.</p>`
    : tableHead("Filter", "Tokens saved", "Reduction") +
      summary.byFilter.map((row) => `<div class="filter-row"><span>${escapeHtml(row.filterKind)}</span><strong>${formatInteger(row.estimatedTokensSaved)}</strong><small>${row.reductionPercent}% reduction</small></div>`).join("");
  const commands = summary.byCommand.length === 0
    ? `<p class="muted">No command data yet.</p>`
    : tableHead("Command", "Calls", "Tokens saved") +
      summary.byCommand
        .slice(0, 12)
        .map((row) => `<div class="filter-row"><span>${escapeHtml(row.command)}</span><strong>${formatInteger(row.calls)}</strong><small>${formatInteger(row.estimatedTokensSaved)} saved</small></div>`)
        .join("");
  const uncovered = summary.uncovered.length === 0
    ? `<p class="muted">${summary.uncoveredTrackingEnabled
        ? "No uncovered commands recorded yet."
        : "Tracking is off. Set SHRINKER_TRACK_UNCOVERED=1 to start collecting."}</p>`
    : tableHead("Command", "Est. tokens", "Calls") +
      summary.uncovered
        .slice(0, 12)
        .map((row) => `<div class="filter-row"><span>${escapeHtml(row.command)}</span><strong>${formatInteger(row.estimatedTokens)}</strong><small>${formatInteger(row.occurrences)} ${row.occurrences === 1 ? "call" : "calls"}</small></div>`)
        .join("");
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
.heading { display: flex; justify-content: space-between; gap: 24px; align-items: start; }
.eyebrow { margin: 0 0 8px; color: var(--blue); font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(28px, 4vw, 44px); letter-spacing: -.03em; }
.subtitle { margin: 8px 0 30px; color: var(--muted); }
.subtitle-2 { margin: -10px 0px 30px; color: var(--muted); font-size: 11px; }
.rate-control { display: grid; gap: 4px; min-width: 218px; color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.rate-field { display: flex; align-items: center; gap: 6px; color: var(--ink); font-size: 14px; font-weight: 500; letter-spacing: 0; text-transform: none; }
.rate-field input { width: 80px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 4px; color: var(--ink); background: var(--surface); font: inherit; }
.rate-field input:focus { outline: 2px solid var(--blue); outline-offset: 1px; border-color: var(--blue); }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; }
.card, .panel { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 8px 24px #26394d0d; }
.card { padding: 18px 20px; }
.card label { display: block; color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.card strong { display: block; margin-top: 6px; font-size: 27px; }
.panel { padding: 22px; }
.panel h2 { margin: 0 0 4px; font-size: 18px; }
.panel p { margin: 0 0 14px; color: var(--muted); }
.panel-heading { display: flex; justify-content: space-between; gap: 20px; align-items: start; }
.savings-activity { margin-bottom: 20px; }
.heatmap-wrap { display: flex; gap: 10px; overflow-x: auto; padding: 2px 0 4px; }
.heatmap-weekdays { display: grid; align-self: stretch; grid-template-rows: repeat(7, 1fr); gap: 2px; padding-top: 1px; color: var(--muted); font-size: 10px; line-height: 12px; }
.heatmap-grid { display: grid; flex: 1; aspect-ratio: 53 / 7; grid-template-columns: repeat(53, minmax(12px, 1fr)); grid-template-rows: repeat(7, 1fr); grid-auto-flow: column; gap: 2px; min-width: 738px; }
.heatmap-cell { display: block; width: 100%; height: 100%; border: 1px solid #dce3e8; border-radius: 2px; }
.heatmap-legend i { display: block; width: 12px; height: 12px; border: 1px solid #dce3e8; border-radius: 2px; }
.heatmap-empty { visibility: hidden; }
.heatmap-level-0 { background: #edf1f4; }
.heatmap-level-1 { background: #b7e4c7; }
.heatmap-level-2 { background: #71c993; border-color: #63bd85; }
.heatmap-level-3 { background: #309d62; border-color: #258d54; }
.heatmap-level-4 { background: #176b41; border-color: #125c36; }
.heatmap-legend { display: flex; align-items: center; gap: 4px; white-space: nowrap; color: var(--muted); font-size: 11px; }
.chart { overflow: hidden; }
svg { display: block; width: 100%; min-width: 620px; height: auto; }
.chart { overflow-x: auto; }
.grid { stroke: var(--line); stroke-width: 1; }
.axis { stroke: #9aa9b5; stroke-width: 1; }
.axis-label, .axis-title { fill: var(--muted); font-size: 12px; }
.trend { fill: none; stroke: var(--blue); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.point { fill: var(--surface); stroke: var(--blue); stroke-width: 3; }
.point:hover { fill: var(--blue); r: 6; }
.lower { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-top: 20px; }
.filter-row { display: grid; grid-template-columns: 1fr auto auto; gap: 18px; align-items: baseline; padding: 11px 0; border-bottom: 1px solid var(--line); }
.filter-row:last-child { border-bottom: 0; }
.filter-row small { color: var(--green); }
.filter-head { padding-top: 0; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.filter-head strong, .filter-head small { color: var(--muted); font-size: 11px; font-weight: 700; }
.muted { color: var(--muted); }
@media (max-width: 720px) { main { padding: 28px 16px 40px; } .heading, .panel-heading { display: block; } .rate-control { margin: 0 0 20px; } .heatmap-legend { margin: 0 0 14px; } .cards, .lower { grid-template-columns: 1fr; } .card strong { font-size: 24px; } }
</style>
</head>
<body>
<main data-saved-tokens="${summary.total.estimatedTokensSaved}" data-runs="${summary.total.runs}" data-default-input-cost="${inputCostPerMillionTokens}">
  <header class="heading">
    <div>
      <p class="eyebrow">Local activity</p>
      <h1>Shrinker stats</h1>
      <p class="subtitle-2">Stats are stored on this machine: ${escapeHtml(summary.databasePath)}</p>
      <p class="subtitle">Token reduction over the last 30 days</p>
    </div>
    <label class="rate-control" for="input-cost-rate">Input price
      <span class="rate-field"><span>$</span><input id="input-cost-rate" type="number" min="0" step="0.01" inputmode="decimal" aria-describedby="input-cost-unit"><span id="input-cost-unit">/ 1M tokens</span></span>
    </label>
  </header>
  <section class="cards">
    <div class="card"><label>All-time saved</label><strong>${formatInteger(summary.total.estimatedTokensSaved)}</strong></div>
    <div class="card"><label>Estimated API cost saved</label><strong id="total-cost-saved">${formatUsd(summary.total.estimatedInputCostSavedUsd)}</strong></div>
    <div class="card"><label>Average saved per run</label><strong id="average-cost-saved">${formatUsd(averageCostSavedUsd)}</strong></div>
    <div class="card"><label>Runs this week</label><strong>${formatInteger(summary.last7Days.runs)}</strong></div>
    <div class="card"><label>Average reduction</label><strong>${summary.total.reductionPercent}%</strong></div>
  </section>
  ${makeSavingsHeatmap(summary.yearlyDaily)}
  <section class="panel chart"><h2>Tokens saved over time</h2><p>Estimated savings from recorded command runs. Cost uses <span id="chart-cost-rate">${formatUsd(inputCostPerMillionTokens)}</span> per million input tokens.</p>${makeChart(summary)}</section>
  <section class="lower">
    <section class="panel"><h2>By filter</h2><p>Where the savings come from.</p>${filters}</section>
    <section class="panel"><h2>Top commands</h2><p>Wrapped commands ranked by number of calls.</p>${commands}</section>
    <section class="panel"><h2>Coverage gaps</h2><p>Uncovered commands ranked by estimated tokens a dedicated filter could see.</p>${uncovered}</section>
  </section>
</main>
<script>
(() => {
  const storageKey = "shrinker.inputCostPerMillionTokens";
  const dashboard = document.querySelector("main[data-saved-tokens]");
  const rateInput = document.querySelector("#input-cost-rate");
  const totalCost = document.querySelector("#total-cost-saved");
  const averageCost = document.querySelector("#average-cost-saved");
  const chartCostRate = document.querySelector("#chart-cost-rate");
  if (!dashboard || !rateInput || !totalCost || !averageCost || !chartCostRate) return;

  const savedTokens = Number(dashboard.dataset.savedTokens);
  const runs = Number(dashboard.dataset.runs);
  const defaultRate = Number(dashboard.dataset.defaultInputCost);
  const storedRateValue = localStorage.getItem(storageKey);
  const storedRate = storedRateValue === null ? Number.NaN : Number(storedRateValue);
  const initialRate = Number.isFinite(storedRate) && storedRate >= 0 ? storedRate : defaultRate;
  const formatCurrency = (value) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(value);
  const updateCosts = (rate) => {
    const total = savedTokens / 1000000 * rate;
    totalCost.textContent = formatCurrency(total);
    averageCost.textContent = formatCurrency(runs === 0 ? 0 : total / runs);
    chartCostRate.textContent = formatCurrency(rate);
  };

  rateInput.value = String(initialRate);
  updateCosts(initialRate);
  rateInput.addEventListener("input", () => {
    const rate = Number(rateInput.value);
    if (!Number.isFinite(rate) || rate < 0) return;
    localStorage.setItem(storageKey, String(rate));
    updateCosts(rate);
  });
})();
</script>
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
    if (request.method === "POST" && request.url === "/__shrinker_shutdown") {
      response.writeHead(204);
      response.end(() => server.close());
      return;
    }

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

async function isShrinkerDashboard(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    return response.ok && (await response.text()).includes("Shrinker stats");
  } catch {
    return false;
  }
}

async function findListeningProcessId(port: number): Promise<number | undefined> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"]);
      const match = stdout
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .find((columns) => columns[1]?.endsWith(`:${port}`) && columns[3] === "LISTENING");
      const processId = Number(match?.[4]);
      return Number.isInteger(processId) && processId > 0 ? processId : undefined;
    }

    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    const processId = Number(stdout.trim().split(/\s+/)[0]);
    return Number.isInteger(processId) && processId > 0 ? processId : undefined;
  } catch {
    return undefined;
  }
}

async function stopLegacyDashboardServer(port: number, url: string): Promise<boolean> {
  if (!(await isShrinkerDashboard(url))) return false;
  const processId = await findListeningProcessId(port);
  if (!processId) return false;

  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(processId), "/F"]);
    } else {
      process.kill(processId, "SIGTERM");
    }
    return true;
  } catch {
    return false;
  }
}

export async function startStatsDashboard(port = 4317, restart = false): Promise<{ pid: number; reused: boolean; restarted: boolean }> {
  const url = `http://127.0.0.1:${port}`;
  let restarted = false;
  if (restart) {
    let response: Response | undefined;
    try {
      response = await fetch(`${url}/__shrinker_shutdown`, {
        method: "POST",
        signal: AbortSignal.timeout(500),
      });
    } catch {}
    if (response && !response.ok) {
      restarted = await stopLegacyDashboardServer(port, url);
      if (!restarted) throw new Error(`Could not restart dashboard server at ${url}`);
    } else {
      restarted = response?.ok ?? false;
    }
  }

  if (await isShrinkerDashboard(url)) {
    openStatsDashboard(url);
    return { pid: 0, reused: true, restarted: false };
  }

  const child = spawn(
    process.execPath,
    [process.argv[1] ?? "", "stats", "--dashboard", "--dashboard-server", "--port", String(port)],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return { pid: child.pid ?? 0, reused: false, restarted };
}
