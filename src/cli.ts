#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import { applyFilter } from "./filters/select-filter.js";
import type { FilterKind } from "./filters/types.js";
import { runCommand } from "./execution/run-command.js";
import { getLatestRawOutput, getRawOutput, saveRawOutput } from "./execution/raw-output-store.js";
import { cleanText } from "./formatting/ansi.js";
import { formatMeasurements, measure } from "./metrics/measure.js";
import { serveStatsDashboard, startStatsDashboard, writeStatsDashboard } from "./metrics/dashboard.js";
import { classifyWrappedRun, commandSignature, isCoverageTrackingEnabled } from "./metrics/coverage.js";
import {
  defaultStatsPath,
  formatCoverage,
  formatStats,
  formatStatsChart,
  getStats,
  recordRun,
  recordUncovered,
} from "./metrics/stats-store.js";
import { checkForUpdate, formatUpdateNotice, markUpdateNoticeShown, wasUpdateNoticeShown } from "./updates/check.js";
import { getCurrentVersion } from "./version.js";

interface CliOptions {
  mode: "exec" | "pipe" | "stats" | "last" | "raw-output" | "track" | "help";
  kind: FilterKind;
  raw: boolean;
  save: boolean;
  trackStats: boolean;
  showMetrics: boolean;
  json: boolean;
  chart: boolean;
  coverage: boolean;
  dashboard: boolean;
  dashboardServer: boolean;
  dashboardRestart: boolean;
  dashboardPort: number;
  showPath: boolean;
  captureId?: string;
  trackExecutable?: string;
  trackSubcommand?: string;
  trackBytes?: number;
  trackExitCode?: number;
  maxLines: number;
  perFileLines: number;
  command: string[];
}

function usage(): string {
  return `Usage:
  shrinker <command> [args...]
  shrinker exec [options] [--] <command> [args...]
  shrinker pipe [options]
  shrinker stats [--json] [--chart] [--coverage] [--dashboard] [--restart] [--port <number>]
  shrinker last [--path]
  shrinker raw <capture-id> [--path]
  shrinker track --executable <name> [--subcommand <name>] [--bytes <number>] [--exit-code <number>]
  shrinker help

Options:
  --kind <auto|git-status|git-diff|git-log|git-list|npm|tail|find|rg|docker|kubectl|cat|gh|test|log>
  --max-lines <number>       default: 120
  --per-file-lines <number>  default: 40
  --raw                      bypass filtering
  --metrics                  print per-run savings and duration
  --no-save                  do not save omitted raw output
  --no-stats                 do not record this run
  --coverage                 list commands shrinker does not cover yet
  --dashboard                serve and open the local dashboard at http://127.0.0.1:4317
  --restart                  restart the local dashboard server
  --port <number>            dashboard server port (default: 4317)
  --help`;
}

function parsePositiveInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${option} requires a non-negative integer`);
  }
  return parsed;
}

function parseInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${option} requires an integer`);
  }
  return parsed;
}

function parseArgs(args: string[]): CliOptions {
  const first = args[0];
  let mode: CliOptions["mode"];
  if (!first || first === "help" || first === "--help" || first === "-h") {
    if (first) args.shift();
    mode = "help";
  } else if (
    first === "exec" ||
    first === "pipe" ||
    first === "stats" ||
    first === "last" ||
    first === "track" ||
    first === "raw"
  ) {
    const reserved = args.shift();
    mode = reserved === "raw" ? "raw-output" : reserved as "exec" | "pipe" | "stats" | "last" | "track";
  } else {
    mode = "exec";
  }

  let kind: FilterKind = "auto";
  let raw = false;
  let save = true;
  let trackStats = true;
  let showMetrics = false;
  let json = false;
  let chart = false;
  let coverage = false;
  let dashboard = false;
  let dashboardServer = false;
  let dashboardRestart = false;
  let dashboardPort = 4317;
  let showPath = false;
  let captureId: string | undefined;
  let trackExecutable: string | undefined;
  let trackSubcommand: string | undefined;
  let trackBytes: number | undefined;
  let trackExitCode: number | undefined;
  let maxLines = 120;
  let perFileLines = 40;

  while (args.length > 0 && args[0] !== "--") {
    const option = args.shift();
    if (option === "--help" || option === "-h") {
      mode = "help";
      break;
    }
    if (option === "--raw") raw = true;
    else if (option === "--metrics") showMetrics = true;
    else if (option === "--no-save") save = false;
    else if (option === "--no-stats") trackStats = false;
    else if (option === "--json" && mode === "stats") json = true;
    else if (option === "--chart" && mode === "stats") chart = true;
    else if (option === "--coverage" && mode === "stats") coverage = true;
    else if (option === "--executable" && mode === "track") trackExecutable = args.shift();
    else if (option === "--subcommand" && mode === "track") trackSubcommand = args.shift();
    else if (option === "--bytes" && mode === "track") trackBytes = parseNonNegativeInteger(args.shift(), "--bytes");
    else if (option === "--exit-code" && mode === "track") trackExitCode = parseInteger(args.shift(), "--exit-code");
    else if (option === "--dashboard" && mode === "stats") dashboard = true;
    else if (option === "--dashboard-server" && mode === "stats") dashboardServer = true;
    else if (option === "--restart" && mode === "stats") dashboardRestart = true;
    else if (option === "--port" && mode === "stats") dashboardPort = parsePositiveInteger(args.shift(), "--port");
    else if (option === "--path" && mode === "last") showPath = true;
    else if (option === "--path" && mode === "raw-output") showPath = true;
    else if (mode === "raw-output" && option && !option.startsWith("-") && !captureId) {
      captureId = option;
    }
    else if (option === "--kind") {
      const value = args.shift() as FilterKind | undefined;
      if (
        !value ||
        ![
          "auto",
          "git-status",
          "git-diff",
          "git-log",
          "git-list",
          "npm",
          "tail",
          "find",
          "rg",
          "docker",
          "kubectl",
          "cat",
          "gh",
          "test",
          "log",
        ].includes(value)
      ) {
        throw new Error("--kind must be auto, git-status, git-diff, git-log, git-list, npm, tail, find, rg, docker, kubectl, cat, gh, test, or log");
      }
      kind = value;
    } else if (option === "--max-lines") {
      maxLines = parsePositiveInteger(args.shift(), "--max-lines");
    } else if (option === "--per-file-lines") {
      perFileLines = parsePositiveInteger(args.shift(), "--per-file-lines");
    } else if (mode === "exec" && option && !option.startsWith("-")) {
      args.unshift(option);
      break;
    } else {
      throw new Error(`Unknown option: ${option}\n\n${usage()}`);
    }
  }

  if (args[0] === "--") args.shift();
  if (mode === "exec" && args.length === 0) throw new Error("exec requires a command");
  if (mode === "stats" && args.length > 0) throw new Error("stats does not accept command arguments");
  if (dashboardRestart && !dashboard) throw new Error("--restart requires stats --dashboard");
  if (mode === "last" && args.length > 0) throw new Error("last does not accept command arguments");
  if (mode === "raw-output" && !captureId) throw new Error("raw requires a capture ID");
  if (mode === "track" && !trackExecutable) throw new Error("track requires --executable");
  if (mode === "track" && args.length > 0) throw new Error("track does not accept command arguments");

  return {
    mode,
    kind,
    raw,
    save,
    trackStats,
    showMetrics,
    json,
    chart,
    coverage,
    dashboard,
    dashboardServer,
    dashboardRestart,
    dashboardPort,
    showPath,
    ...(captureId ? { captureId } : {}),
    ...(trackExecutable ? { trackExecutable } : {}),
    ...(trackSubcommand ? { trackSubcommand } : {}),
    ...(trackBytes === undefined ? {} : { trackBytes }),
    ...(trackExitCode === undefined ? {} : { trackExitCode }),
    maxLines,
    perFileLines,
    command: args,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function render(
  rawOutput: string,
  options: CliOptions,
  durationMs?: number,
  exitCode?: number,
): Promise<void> {
  if (options.raw) {
    process.stdout.write(rawOutput);
    return;
  }

  let result;
  try {
    result = applyFilter(
      rawOutput,
      options.kind,
      options.command,
      { maxLines: options.maxLines, perFileLines: options.perFileLines },
    );
  } catch (error) {
    process.stderr.write(`[shrinker] filter failed; returning raw output: ${String(error)}\n`);
    process.stdout.write(rawOutput);
    return;
  }

  const output = cleanText(result.output);
  const measurements = measure(rawOutput, output);
  process.stdout.write(`${output}\n`);
  if (options.showMetrics) {
    process.stderr.write(`${formatMeasurements(measurements, durationMs)}\n`);
  }

  if (options.trackStats) {
    const signature = options.mode === "pipe" ? undefined : commandSignature(options.command);
    try {
      recordRun({
        mode: options.mode === "pipe" ? "pipe" : "exec",
        filterKind: result.kind,
        commandName:
          options.mode === "pipe" ? "stdin" : path.basename(options.command[0] ?? "unknown"),
        ...(signature?.subcommand ? { commandSubcommand: signature.subcommand } : {}),
        measurements,
        ...(durationMs === undefined ? {} : { durationMs }),
        omitted: result.omitted,
        ...(exitCode === undefined ? {} : { exitCode }),
      });
    } catch (error) {
      process.stderr.write(`[shrinker] could not record stats: ${String(error)}\n`);
    }

    if (options.mode !== "pipe" && isCoverageTrackingEnabled()) {
      try {
        const reason = classifyWrappedRun({
          matched: result.matched,
          kind: result.kind,
          measurements,
        });
        if (reason && signature) {
          recordUncovered({
            source: "wrapped",
            reason,
            executable: signature.executable,
            ...(signature.subcommand ? { subcommand: signature.subcommand } : {}),
            rawBytes: measurements.rawBytes,
            rawEstimatedTokens: measurements.rawEstimatedTokens,
            ...(exitCode === undefined ? {} : { exitCode }),
          });
        }
      } catch (error) {
        process.stderr.write(`[shrinker] could not record coverage: ${String(error)}\n`);
      }
    }
  }

  const isWrappedGitLog = options.mode === "exec" && result.kind === "git-log";
  const shouldSave = result.recovery !== "threshold" && !isWrappedGitLog;
  if (result.omitted && options.save && shouldSave) {
    try {
      const capture = await saveRawOutput(rawOutput, options.command);
      process.stderr.write(`[full: shrinker raw ${capture.id}]\n`);
    } catch (error) {
      process.stderr.write(`[shrinker] could not save full output: ${String(error)}\n`);
    }
  }
}

async function maybeShowUpdateNotice(): Promise<void> {
  try {
    const currentVersion = getCurrentVersion();
    const result = await checkForUpdate(currentVersion ? { currentVersion } : {});
    if (result.latestVersion && wasUpdateNoticeShown(result.latestVersion)) return;
    const notice = formatUpdateNotice(result);
    if (notice) process.stderr.write(`${notice}\n`);
    if (result.latestVersion && notice) markUpdateNoticeShown(result.latestVersion);
  } catch {}
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.mode === "help") {
    process.stdout.write(`${usage()}\n`);
    await maybeShowUpdateNotice();
    return;
  }

  if (options.mode === "stats") {
    const summary = getStats(defaultStatsPath());
    if (options.dashboard) {
      if (options.dashboardServer) {
        await serveStatsDashboard(() => getStats(defaultStatsPath()), options.dashboardPort);
      } else {
        writeStatsDashboard(summary);
        const dashboard = await startStatsDashboard(options.dashboardPort, options.dashboardRestart);
        if (dashboard.reused) {
          process.stdout.write(`Dashboard server already running at http://127.0.0.1:${options.dashboardPort}\n`);
        } else if (dashboard.restarted) {
          process.stdout.write(`Dashboard server restarted at http://127.0.0.1:${options.dashboardPort} (PID ${dashboard.pid})\n`);
        } else {
          process.stdout.write(`Dashboard server started at http://127.0.0.1:${options.dashboardPort} (PID ${dashboard.pid})\n`);
        }
        await maybeShowUpdateNotice();
      }
      return;
    }
    const output = options.json
      ? JSON.stringify(summary, null, 2)
      : options.coverage
        ? formatCoverage(summary)
        : options.chart
          ? formatStatsChart(summary)
          : formatStats(summary);
    process.stdout.write(`${output}\n`);
            await maybeShowUpdateNotice();
    return;
  }

  if (options.mode === "track") {
    try {
      recordUncovered({
        source: "shell",
        reason: "unlisted-subcommand",
        executable: options.trackExecutable ?? "",
        ...(options.trackSubcommand ? { subcommand: options.trackSubcommand } : {}),
        ...(options.trackBytes === undefined ? {} : { rawBytes: options.trackBytes }),
        ...(options.trackBytes === undefined
          ? {}
          : { rawEstimatedTokens: Math.ceil(options.trackBytes / 4) }),
        ...(options.trackExitCode === undefined ? {} : { exitCode: options.trackExitCode }),
      });
    } catch {}
    return;
  }

  if (options.mode === "last") {
    const latest = await getLatestRawOutput();
    if (!latest) throw new Error("No saved raw output");
    process.stdout.write(options.showPath ? `${latest.path}\n` : latest.output);
    return;
  }

  if (options.mode === "raw-output") {
    const capture = await getRawOutput(options.captureId ?? "");
    if (!capture) throw new Error(`Raw capture not found: ${options.captureId}`);
    process.stdout.write(options.showPath ? `${capture.path}\n` : capture.output);
    return;
  }

  if (options.mode === "pipe") {
    const input = await readStdin();
    await render(input, options);
    await maybeShowUpdateNotice();
    return;
  }

  const [command, ...args] = options.command;
  if (!command) throw new Error("Missing command");
  const result = await runCommand(command, args);
  await render(result.combined, options, result.durationMs, result.exitCode);
  process.exitCode = result.exitCode;
  if (result.exitCode === 0) await maybeShowUpdateNotice();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
