#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { applyFilter } from "./filters/select-filter.js";
import type { FilterKind } from "./filters/types.js";
import { runCommand } from "./execution/run-command.js";
import { getLatestRawOutput, getRawOutput, saveRawOutput } from "./execution/raw-output-store.js";
import { cleanText } from "./formatting/ansi.js";
import { formatMeasurements, measure } from "./metrics/measure.js";
import { defaultStatsPath, formatStats, getStats, recordRun } from "./metrics/stats-store.js";

interface CliOptions {
  mode: "exec" | "pipe" | "stats" | "last" | "raw-output" | "help";
  kind: FilterKind;
  raw: boolean;
  save: boolean;
  trackStats: boolean;
  showMetrics: boolean;
  json: boolean;
  showPath: boolean;
  captureId?: string;
  maxLines: number;
  perFileLines: number;
  command: string[];
}

function usage(): string {
  return `Usage:
  shrink <command> [args...]
  shrink exec [options] [--] <command> [args...]
  shrink pipe [options]
  shrink stats [--json]
  shrink last [--path]
  shrink raw <capture-id> [--path]
  shrink help

Options:
  --kind <auto|git-status|git-diff|git-log|git-list|npm|tail|find|rg|docker|kubectl|cat|gh|test|log>
  --max-lines <number>       default: 120
  --per-file-lines <number>  default: 40
  --raw                      bypass filtering
  --metrics                  print per-run savings and duration
  --no-save                  do not save omitted raw output
  --no-stats                 do not record this run
  --help`;
}

function parsePositiveInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive integer`);
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
    first === "raw"
  ) {
    const reserved = args.shift();
    mode = reserved === "raw" ? "raw-output" : reserved as "exec" | "pipe" | "stats" | "last";
  } else {
    mode = "exec";
  }

  let kind: FilterKind = "auto";
  let raw = false;
  let save = true;
  let trackStats = true;
  let showMetrics = false;
  let json = false;
  let showPath = false;
  let captureId: string | undefined;
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
  if (mode === "last" && args.length > 0) throw new Error("last does not accept command arguments");
  if (mode === "raw-output" && !captureId) throw new Error("raw requires a capture ID");

  return {
    mode,
    kind,
    raw,
    save,
    trackStats,
    showMetrics,
    json,
    showPath,
    ...(captureId ? { captureId } : {}),
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
    process.stderr.write(`[shrink] filter failed; returning raw output: ${String(error)}\n`);
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
    try {
      recordRun({
        mode: options.mode === "pipe" ? "pipe" : "exec",
        filterKind: result.kind,
        commandName:
          options.mode === "pipe" ? "stdin" : path.basename(options.command[0] ?? "unknown"),
        measurements,
        ...(durationMs === undefined ? {} : { durationMs }),
        omitted: result.omitted,
        ...(exitCode === undefined ? {} : { exitCode }),
      });
    } catch (error) {
      process.stderr.write(`[shrink] could not record stats: ${String(error)}\n`);
    }
  }

  const isWrappedGitLog = options.mode === "exec" && result.kind === "git-log";
  const shouldSave = result.recovery !== "threshold" && !isWrappedGitLog;
  if (result.omitted && options.save && shouldSave) {
    try {
      const capture = await saveRawOutput(rawOutput, options.command);
      process.stderr.write(`[full: shrink raw ${capture.id}]\n`);
    } catch (error) {
      process.stderr.write(`[shrink] could not save full output: ${String(error)}\n`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.mode === "help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (options.mode === "stats") {
    const summary = getStats(defaultStatsPath());
    process.stdout.write(`${options.json ? JSON.stringify(summary, null, 2) : formatStats(summary)}\n`);
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
    return;
  }

  const [command, ...args] = options.command;
  if (!command) throw new Error("Missing command");
  const result = await runCommand(command, args);
  await render(result.combined, options, result.durationMs, result.exitCode);
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
