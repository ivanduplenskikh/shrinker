import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FilterKind } from "../filters/types.js";
import type { Measurements } from "./measure.js";

export interface RunStatistic {
  mode: "exec" | "pipe";
  filterKind: Exclude<FilterKind, "auto">;
  commandName: string;
  measurements: Measurements;
  durationMs?: number;
  omitted: boolean;
  exitCode?: number;
}

export interface StatsRow {
  filterKind: string;
  runs: number;
  rawEstimatedTokens: number;
  outputEstimatedTokens: number;
  estimatedTokensSaved: number;
  reductionPercent: number;
}

export interface StatsSummary {
  databasePath: string;
  total: StatsRow;
  last7Days: StatsRow;
  byFilter: StatsRow[];
}

interface AggregateRow {
  filter_kind: string | null;
  runs: number;
  raw_tokens: number;
  output_tokens: number;
  tokens_saved: number;
}

export function defaultStatsPath(): string {
  return path.join(os.homedir(), ".shrink", "stats.db");
}

function openDatabase(databasePath: string): DatabaseSync {
  mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 2000;
    CREATE TABLE IF NOT EXISTS runs (
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
    CREATE INDEX IF NOT EXISTS runs_created_at_idx ON runs(created_at);
    CREATE INDEX IF NOT EXISTS runs_filter_kind_idx ON runs(filter_kind);
  `);
  return database;
}

export function recordRun(statistic: RunStatistic, databasePath = defaultStatsPath()): void {
  const database = openDatabase(databasePath);
  try {
    database
      .prepare(`
        INSERT INTO runs (
          mode, filter_kind, command_name, raw_bytes, output_bytes,
          raw_estimated_tokens, output_estimated_tokens, estimated_tokens_saved,
          reduction_percent, duration_ms, omitted, exit_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        statistic.mode,
        statistic.filterKind,
        statistic.commandName,
        statistic.measurements.rawBytes,
        statistic.measurements.outputBytes,
        statistic.measurements.rawEstimatedTokens,
        statistic.measurements.outputEstimatedTokens,
        statistic.measurements.estimatedTokensSaved,
        statistic.measurements.reductionPercent,
        statistic.durationMs ?? null,
        statistic.omitted ? 1 : 0,
        statistic.exitCode ?? null,
      );
  } finally {
    database.close();
  }
}

function toStatsRow(row: AggregateRow, filterKind = "all"): StatsRow {
  const raw = Number(row.raw_tokens ?? 0);
  const output = Number(row.output_tokens ?? 0);
  return {
    filterKind,
    runs: Number(row.runs ?? 0),
    rawEstimatedTokens: raw,
    outputEstimatedTokens: output,
    estimatedTokensSaved: Number(row.tokens_saved ?? 0),
    reductionPercent: raw === 0 ? 0 : Math.max(0, Math.round((1 - output / raw) * 100)),
  };
}

const AGGREGATE = `
  COUNT(*) AS runs,
  COALESCE(SUM(raw_estimated_tokens), 0) AS raw_tokens,
  COALESCE(SUM(output_estimated_tokens), 0) AS output_tokens,
  COALESCE(SUM(estimated_tokens_saved), 0) AS tokens_saved
`;

export function getStats(databasePath = defaultStatsPath()): StatsSummary {
  const database = openDatabase(databasePath);
  try {
    const total = database
      .prepare(`SELECT ${AGGREGATE} FROM runs`)
      .get() as unknown as AggregateRow;
    const last7Days = database
      .prepare(`SELECT ${AGGREGATE} FROM runs WHERE created_at >= datetime('now', '-7 days')`)
      .get() as unknown as AggregateRow;
    const byFilter = database
      .prepare(`
        SELECT filter_kind, ${AGGREGATE}
        FROM runs
        GROUP BY filter_kind
        ORDER BY tokens_saved DESC, filter_kind ASC
      `)
      .all() as unknown as AggregateRow[];

    return {
      databasePath,
      total: toStatsRow(total),
      last7Days: toStatsRow(last7Days),
      byFilter: byFilter.map((row) => toStatsRow(row, row.filter_kind ?? "unknown")),
    };
  } finally {
    database.close();
  }
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatRuns(value: number): string {
  return `${formatInteger(value)} ${value === 1 ? "run" : "runs"}`;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

function makeBar(value: number, maxValue: number, width = 18): string {
  if (maxValue <= 0 || value <= 0) return "-".repeat(width);
  const filled = Math.max(1, Math.round((value / maxValue) * width));
  return `${"#".repeat(Math.min(width, filled))}${"-".repeat(Math.max(0, width - filled))}`;
}

export function formatStats(summary: StatsSummary): string {
  const allTime = `All time: ${formatRuns(summary.total.runs)} | est. ${formatInteger(summary.total.estimatedTokensSaved)} tokens saved | -${summary.total.reductionPercent}%`;
  const last7 = `Last 7 days: ${formatRuns(summary.last7Days.runs)} | est. ${formatInteger(summary.last7Days.estimatedTokensSaved)} tokens saved | -${summary.last7Days.reductionPercent}%`;

  const lines = [
    "Shrink Token Savings Dashboard",
    "================================",
    "Overview",
    `  ${allTime}`,
    `  ${last7}`,
  ];

  if (summary.byFilter.length > 0) {
    lines.push("", "By Filter", "  Filter           Runs        Raw         Output      Saved       Reduce   Share   Savings Bar");
    lines.push("  ---------------  ----------  ----------  ----------  ----------  -------  ------  ------------------");
    const maxSaved = Math.max(...summary.byFilter.map((row) => row.estimatedTokensSaved));
    const totalSaved = summary.total.estimatedTokensSaved;
    for (const row of summary.byFilter) {
      const share =
        totalSaved > 0 ? Math.round((row.estimatedTokensSaved / totalSaved) * 100) : 0;
      lines.push(
        `  ${row.filterKind.padEnd(15)}  ${formatRuns(row.runs).padStart(10)}  ${formatInteger(row.rawEstimatedTokens).padStart(10)}  ${formatInteger(row.outputEstimatedTokens).padStart(10)}  ${formatInteger(row.estimatedTokensSaved).padStart(10)}  ${`-${formatPercent(row.reductionPercent)}`.padStart(7)}  ${formatPercent(share).padStart(6)}  ${makeBar(row.estimatedTokensSaved, maxSaved)}`,
      );
    }
  }

  lines.push("", "Storage", `  Database: ${summary.databasePath}`);
  return lines.join("\n");
}
