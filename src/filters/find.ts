import path from "node:path";
import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

const ERROR_PATTERN = /permission denied|no such file|cannot access|find:/i;

export function filterFindOutput(input: string, options: FilterOptions): FilterResult {
  const lines = cleanText(input).split("\n").filter((line) => line.trim());
  const paths: string[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    if (ERROR_PATTERN.test(line)) {
      errors.push(line);
    } else {
      paths.push(line);
    }
  }

  if (paths.length === 0 && errors.length === 0) {
    return {
      output: "",
      kind: "find",
      omitted: false,
      notes: [],
    };
  }

  const directoryCounts = new Map<string, number>();
  for (const filePath of paths) {
    const directory = path.dirname(filePath).replace(/\\/g, "/") || ".";
    directoryCounts.set(directory, (directoryCounts.get(directory) ?? 0) + 1);
  }

  const topDirectories = [...directoryCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8);

  const output: string[] = [`paths: ${paths.length}`];
  if (topDirectories.length > 0) {
    output.push("top directories:");
    for (const [directory, count] of topDirectories) {
      output.push(`  ${directory} (${count})`);
    }
  }

  if (errors.length > 0) {
    output.push(`errors: ${errors.length}`);
    output.push(...errors.slice(0, Math.max(1, options.perFileLines)).map((line) => `  ${line}`));
    if (errors.length > options.perFileLines) {
      output.push(`  ... ${errors.length - options.perFileLines} error lines omitted ...`);
    }
  }

  output.push("sample paths:");
  output.push(...paths.slice(0, Math.max(1, options.perFileLines)).map((filePath) => `  ${filePath}`));
  if (paths.length > options.perFileLines) {
    output.push(`  ... ${paths.length - options.perFileLines} paths omitted ...`);
  }

  const limited = limitLines(output, options.maxLines);
  const omitted =
    paths.length > options.perFileLines ||
    errors.length > options.perFileLines ||
    limited.omitted > 0;

  return {
    output: limited.lines.join("\n"),
    kind: "find",
    omitted,
    notes: omitted ? ["collapsed path listing"] : [],
  };
}
