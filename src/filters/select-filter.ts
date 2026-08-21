import { filterGenericLog } from "./generic-log.js";
import { filterGitDiff } from "./git-diff.js";
import { filterGitStatus } from "./git-status.js";
import { filterTestOutput } from "./test-output.js";
import type { FilterKind, FilterOptions, FilterResult, OutputFilter } from "./types.js";

const FILTERS: Record<Exclude<FilterKind, "auto">, OutputFilter> = {
  "git-status": filterGitStatus,
  "git-diff": filterGitDiff,
  test: filterTestOutput,
  log: filterGenericLog,
};

export function detectFilter(command: string[]): Exclude<FilterKind, "auto"> {
  const normalized = command.join(" ").toLowerCase();
  if (/\bgit\s+status\b/.test(normalized)) return "git-status";
  if (/\bgit\s+(?:diff|show)\b/.test(normalized)) return "git-diff";
  if (/\b(test|pytest|jest|vitest|cargo test|go test|dotnet test|rspec)\b/.test(normalized)) {
    return "test";
  }
  return "log";
}

export function applyFilter(
  input: string,
  requestedKind: FilterKind,
  command: string[],
  options: FilterOptions,
): FilterResult {
  const kind = requestedKind === "auto" ? detectFilter(command) : requestedKind;
  return FILTERS[kind](input, options);
}
