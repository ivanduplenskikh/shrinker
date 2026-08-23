import { filterGenericLog } from "./generic-log.js";
import { filterCatOutput } from "./cat.js";
import { filterDockerOutput } from "./docker.js";
import { filterFindOutput } from "./find.js";
import { filterGitDiff } from "./git-diff.js";
import { filterGitList } from "./git-list.js";
import { filterGitLog } from "./git-log.js";
import { filterGitStatus } from "./git-status.js";
import { filterGhOutput } from "./gh.js";
import { filterKubectlOutput } from "./kubectl.js";
import { filterNpmOutput } from "./npm.js";
import { filterRgOutput } from "./rg.js";
import { filterTailOutput } from "./tail.js";
import { filterTestOutput } from "./test-output.js";
import type { FilterKind, FilterOptions, FilterResult, OutputFilter } from "./types.js";
import { cleanText } from "../formatting/ansi.js";
import { measure } from "../metrics/measure.js";

const FILTERS: Record<Exclude<FilterKind, "auto">, OutputFilter> = {
  "git-status": filterGitStatus,
  "git-diff": filterGitDiff,
  "git-log": filterGitLog,
  "git-list": filterGitList,
  npm: filterNpmOutput,
  tail: filterTailOutput,
  find: filterFindOutput,
  rg: filterRgOutput,
  docker: filterDockerOutput,
  kubectl: filterKubectlOutput,
  cat: filterCatOutput,
  gh: filterGhOutput,
  test: filterTestOutput,
  log: filterGenericLog,
};

export interface FilterDetection {
  kind: Exclude<FilterKind, "auto">;
  matched: boolean;
}

export function detectFilter(command: string[]): Exclude<FilterKind, "auto"> {
  return detectFilterMatch(command).kind;
}

export function detectFilterMatch(command: readonly string[]): FilterDetection {
  const executable = detectExecutable(command);
  const matched = (kind: Exclude<FilterKind, "auto">): FilterDetection => ({ kind, matched: true });

  const gitSubcommand = detectGitSubcommand(command);
  if (gitSubcommand === "status") return matched("git-status");
  if (gitSubcommand === "log") return matched("git-log");
  if (gitSubcommand === "reflog") return matched("git-log");
  if (gitSubcommand === "diff" || gitSubcommand === "show") return matched("git-diff");
  if (gitSubcommand) return matched("git-list");

  if (executable === "npm" || executable === "pnpm" || executable === "yarn") {
    if (isTestRunnerCommand(command)) return matched("test");
    return matched("npm");
  }

  if (executable === "tail") return matched("tail");
  if (executable === "find") return matched("find");
  if (executable === "rg" || executable === "ripgrep") return matched("rg");
  if (executable === "docker") return matched("docker");
  if (executable === "kubectl") return matched("kubectl");
  if (executable === "cat") return matched("cat");
  if (executable === "gh") return matched("gh");

  if (isTestRunnerCommand(command)) {
    return matched("test");
  }
  return { kind: "log", matched: false };
}

function detectExecutable(command: readonly string[]): string | undefined {
  const first = command[0];
  if (!first) return undefined;
  return first
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.exe$/i, "")
    .toLowerCase();
}

function isTestRunnerCommand(command: readonly string[]): boolean {
  const normalized = command.join(" ").toLowerCase();
  return /\b(test|pytest|jest|vitest|cargo test|go test|dotnet test|rspec|npm test|pnpm test|yarn test)\b/.test(normalized);
}

function detectGitSubcommand(command: readonly string[]): string | undefined {
  const gitIndex = command.findIndex((part) => /(?:^|[\\/])git(?:\.exe)?$/i.test(part));
  if (gitIndex < 0) return undefined;

  const optionsWithValues = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
  for (let index = gitIndex + 1; index < command.length; index += 1) {
    const part = command[index];
    if (!part) continue;
    if (optionsWithValues.has(part)) {
      index += 1;
      continue;
    }
    if (part.startsWith("-")) continue;
    return part.toLowerCase();
  }
  return undefined;
}

export function applyFilter(
  input: string,
  requestedKind: FilterKind,
  command: string[],
  options: FilterOptions,
): FilterResult & { matched: boolean } {
  const detection = requestedKind === "auto"
    ? detectFilterMatch(command)
    : { kind: requestedKind, matched: true };
  const kind = detection.kind;
  const result = FILTERS[kind](input, { ...options, command });
  const cleanedRaw = cleanText(input);
  const comparison = measure(cleanedRaw, result.output);

  if (
    comparison.outputBytes >= comparison.rawBytes ||
    comparison.outputEstimatedTokens >= comparison.rawEstimatedTokens
  ) {
    return {
      output: cleanedRaw,
      kind,
      matched: detection.matched,
      omitted: false,
      notes: [...result.notes, "compact output was not smaller; returned cleaned raw output"],
    };
  }

  return { ...result, matched: detection.matched };
}
