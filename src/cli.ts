#!/usr/bin/env node
import process from "node:process";
import { applyFilter } from "./filters/select-filter.js";
import type { FilterKind } from "./filters/types.js";
import { runCommand } from "./execution/run-command.js";
import { saveRawOutput } from "./execution/raw-output-store.js";
import { cleanText } from "./formatting/ansi.js";
import { formatMeasurements, measure } from "./metrics/measure.js";

interface CliOptions {
  mode: "exec" | "pipe";
  kind: FilterKind;
  raw: boolean;
  save: boolean;
  maxLines: number;
  perFileLines: number;
  command: string[];
}

function usage(): string {
  return `Usage:
  shrink exec [options] -- <command> [args...]
  shrink pipe [options]

Options:
  --kind <auto|git-status|git-diff|git-log|test|log>
  --max-lines <number>       default: 120
  --per-file-lines <number>  default: 40
  --raw                      bypass filtering
  --no-save                  do not save omitted raw output
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
  const mode = args.shift();
  if (mode !== "exec" && mode !== "pipe") throw new Error(usage());

  let kind: FilterKind = "auto";
  let raw = false;
  let save = true;
  let maxLines = 120;
  let perFileLines = 40;

  while (args.length > 0 && args[0] !== "--") {
    const option = args.shift();
    if (option === "--help") throw new Error(usage());
    if (option === "--raw") raw = true;
    else if (option === "--no-save") save = false;
    else if (option === "--kind") {
      const value = args.shift() as FilterKind | undefined;
      if (
        !value ||
        !["auto", "git-status", "git-diff", "git-log", "test", "log"].includes(value)
      ) {
        throw new Error("--kind must be auto, git-status, git-diff, git-log, test, or log");
      }
      kind = value;
    } else if (option === "--max-lines") {
      maxLines = parsePositiveInteger(args.shift(), "--max-lines");
    } else if (option === "--per-file-lines") {
      perFileLines = parsePositiveInteger(args.shift(), "--per-file-lines");
    } else {
      throw new Error(`Unknown option: ${option}\n\n${usage()}`);
    }
  }

  if (args[0] === "--") args.shift();
  if (mode === "exec" && args.length === 0) throw new Error("exec requires a command after --");

  return { mode, kind, raw, save, maxLines, perFileLines, command: args };
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
  process.stderr.write(`${formatMeasurements(measurements, durationMs)}\n`);

  const shouldSave =
    result.recovery !== "threshold" || measurements.estimatedTokensSaved >= 50;
  if (result.omitted && options.save && shouldSave) {
    const path = await saveRawOutput(rawOutput, options.command);
    process.stderr.write(`[shrink] full output: ${path}\n`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.mode === "pipe") {
    const input = await readStdin();
    await render(input, options);
    return;
  }

  const [command, ...args] = options.command;
  if (!command) throw new Error("Missing command");
  const result = await runCommand(command, args);
  await render(result.combined, options, result.durationMs);
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
