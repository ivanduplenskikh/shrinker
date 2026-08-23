import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { measure } from "../src/metrics/measure.js";
import { writeStatsDashboard } from "../src/metrics/dashboard.js";
import { formatStats, formatStatsChart, getStats, recordRun } from "../src/metrics/stats-store.js";

test("SQLite stats persist and aggregate runs by filter", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-stats-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "stats.db");

  recordRun(
    {
      mode: "exec",
      filterKind: "git-log",
      commandName: "git",
      measurements: measure("x".repeat(400), "x".repeat(100)),
      durationMs: 20,
      omitted: true,
      exitCode: 0,
    },
    databasePath,
  );
  recordRun(
    {
      mode: "pipe",
      filterKind: "log",
      commandName: "stdin",
      measurements: measure("x".repeat(200), "x".repeat(100)),
      omitted: true,
    },
    databasePath,
  );

  const summary = getStats(databasePath);
  const dashboardFile = await import("node:fs/promises").then(({ access }) => access(path.join(directory, "dashboard.html")));
  assert.equal(dashboardFile, undefined);
  assert.equal(summary.total.runs, 2);
  assert.equal(summary.total.rawEstimatedTokens, 150);
  assert.equal(summary.total.outputEstimatedTokens, 50);
  assert.equal(summary.total.estimatedTokensSaved, 100);
  assert.equal(summary.total.estimatedInputCostSavedUsd, 0.0005);
  assert.equal(summary.total.reductionPercent, 67);
  assert.equal(summary.last7Days.runs, 2);
  assert.equal(summary.daily.length, 1);
  assert.equal(summary.daily[0]?.estimatedTokensSaved, 100);
  assert.equal(summary.yearlyDaily.length, 1);
  assert.equal(summary.yearlyDaily[0]?.estimatedTokensSaved, 100);
  assert.deepEqual(
    summary.byFilter.map((row) => [row.filterKind, row.runs, row.estimatedTokensSaved]),
    [
      ["git-log", 1, 75],
      ["log", 1, 25],
    ],
  );

  const formatted = formatStats(summary);
  assert.match(formatted, /All time: 2 runs \| est\. 100 tokens saved \| -67%/);
  assert.match(formatted, /git-log/);
  assert.match(formatted, /Database:/);
  assert.match(formatStatsChart(summary), /Last 30 Days/);
  assert.match(formatStatsChart(summary), /Activity/);
  const dashboardPath = path.join(directory, "dashboard.html");
  const generatedPath = writeStatsDashboard(summary, dashboardPath);
  assert.equal(generatedPath, dashboardPath);
  const dashboard = await import("node:fs/promises").then(({ readFile }) => readFile(dashboardPath, "utf8"));
  assert.match(dashboard, /Tokens saved over time/);
  assert.match(dashboard, /Savings activity/);
  assert.match(dashboard, /heatmap-grid/);
  assert.match(dashboard, /grid-template-columns: repeat\(53, minmax\(12px, 1fr\)\)/);
  assert.match(dashboard, /aspect-ratio: 53 \/ 7/);
  assert.match(dashboard, /Daily estimated token savings over the last 365 days/);
  assert.match(dashboard, /estimated tokens saved/);
  assert.match(dashboard, /Stats are stored on this machine:/);
  assert.doesNotMatch(dashboard, /<h2>Storage<\/h2>/);
  assert.match(dashboard, /Estimated API cost saved/);
  assert.match(dashboard, /Average saved per run/);
  assert.match(dashboard, /id="chart-cost-rate">\$5\.00<\/span> per million input tokens/);
  assert.match(dashboard, /id="input-cost-rate"/);
  assert.match(dashboard, /storedRateValue === null \? Number\.NaN : Number\(storedRateValue\)/);
  assert.match(dashboard, /localStorage\.setItem\(storageKey, String\(rate\)\)/);
  assert.match(dashboard, /git-log/);
  assert.match(dashboard, /rel="icon"/);
  assert.match(dashboard, /data:image\/svg\+xml/);
});

test("runs are counted per command including the subcommand", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-commands-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "stats.db");

  const record = (commandName: string, commandSubcommand?: string) =>
    recordRun(
      {
        mode: "exec",
        filterKind: "git-status",
        commandName,
        ...(commandSubcommand ? { commandSubcommand } : {}),
        measurements: measure("x".repeat(400), "x".repeat(100)),
        omitted: true,
      },
      databasePath,
    );

  record("git", "status");
  record("git", "status");
  record("git", "diff");
  record("docker");

  const summary = getStats(databasePath);
  assert.deepEqual(
    summary.byCommand.map((row) => [row.command, row.calls]),
    [
      ["git status", 2],
      ["docker", 1],
      ["git diff", 1],
    ],
  );
  assert.match(formatStats(summary), /By Command/);
  assert.match(formatStats(summary), /git status/);

  const dashboardPath = path.join(directory, "dashboard.html");
  writeStatsDashboard(summary, dashboardPath);
  const dashboard = await import("node:fs/promises").then(({ readFile }) => readFile(dashboardPath, "utf8"));
  assert.match(dashboard, /<h2>Top commands<\/h2>/);
  assert.match(dashboard, /filter-head/);
  assert.match(dashboard, /<span>Command<\/span>/);
  assert.match(dashboard, /<span>git status<\/span>/);
});

test("databases created before command_subcommand still work", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-migrate-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "stats.db");

  const { DatabaseSync } = await import("node:sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE runs (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      mode TEXT NOT NULL,
      filter_kind TEXT NOT NULL,
      command_name TEXT NOT NULL,
      raw_bytes INTEGER NOT NULL,
      output_bytes INTEGER NOT NULL,
      raw_estimated_tokens INTEGER NOT NULL,
      output_estimated_tokens INTEGER NOT NULL,
      estimated_tokens_saved INTEGER NOT NULL,
      reduction_percent INTEGER NOT NULL,
      duration_ms INTEGER,
      omitted INTEGER NOT NULL,
      exit_code INTEGER
    );
    INSERT INTO runs (
      mode, filter_kind, command_name, raw_bytes, output_bytes, raw_estimated_tokens,
      output_estimated_tokens, estimated_tokens_saved, reduction_percent, omitted
    ) VALUES ('exec', 'git-log', 'git', 400, 100, 100, 25, 75, 75, 1);
  `);
  legacy.close();

  recordRun(
    {
      mode: "exec",
      filterKind: "git-status",
      commandName: "git",
      commandSubcommand: "status",
      measurements: measure("x".repeat(400), "x".repeat(100)),
      omitted: true,
    },
    databasePath,
  );

  const summary = getStats(databasePath);
  assert.equal(summary.total.runs, 2);
  assert.deepEqual(
    summary.byCommand.map((row) => [row.command, row.calls]).sort(),
    [
      ["git status", 1],
      ["git", 1],
    ],
  );
});

test("an empty stats database returns zero totals", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-stats-empty-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const summary = getStats(path.join(directory, "stats.db"));

  assert.equal(summary.total.runs, 0);
  assert.equal(summary.total.estimatedTokensSaved, 0);
  assert.equal(summary.total.estimatedInputCostSavedUsd, 0);
  assert.equal(summary.total.reductionPercent, 0);
  assert.deepEqual(summary.byFilter, []);
  assert.deepEqual(summary.daily, []);
  assert.match(formatStatsChart(summary), /No recorded runs/);
});
