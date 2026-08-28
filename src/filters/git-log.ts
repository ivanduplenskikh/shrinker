import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

interface Commit {
  hash: string;
  refs?: string;
  author?: string;
  date?: string;
  subject?: string;
  body: string[];
}

const ONELINE_PATTERN = /^[0-9a-f]{7,40}(?:\s+\([^)]+\))?\s+\S/i;
const BODY_LIMIT = 3;
const TRAILER_PATTERN = /^(?:Signed-off-by|Co-authored-by):/i;

const RAW_SHAPE_FLAGS = new Set([
  "-L",
  "-c",
  "-p",
  "-u",
  "--cc",
  "--dirstat",
  "--name-only",
  "--name-status",
  "--numstat",
  "--patch",
  "--patch-with-raw",
  "--patch-with-stat",
  "--raw",
  "--remerge-diff",
  "--shortstat",
  "--show-signature",
  "--stat",
  "--summary",
]);

const VALUE_FLAGS = new Set([
  "-G",
  "-L",
  "-O",
  "-S",
  "-n",
  "--after",
  "--author",
  "--before",
  "--committer",
  "--date",
  "--encoding",
  "--grep",
  "--max-count",
  "--since",
  "--skip",
  "--until",
]);

const SAFE_COMPACT_FLAGS = new Set([
  "-E",
  "-F",
  "-i",
  "-n",
  "--all",
  "--all-match",
  "--ancestry-path",
  "--author",
  "--before",
  "--branches",
  "--committer",
  "--date-order",
  "--decorate",
  "--exclude",
  "--extended-regexp",
  "--first-parent",
  "--fixed-strings",
  "--glob",
  "--grep",
  "--invert-grep",
  "--max-count",
  "--merges",
  "--no-color",
  "--no-decorate",
  "--no-merges",
  "--not",
  "--remotes",
  "--reverse",
  "--since",
  "--tags",
  "--topo-order",
  "--until",
]);

function gitLogFlags(command: readonly string[]): string[] {
  const logIndex = command.findIndex((part) => part.toLowerCase() === "log");
  if (logIndex < 0) return [];

  const flags: string[] = [];
  for (let index = logIndex + 1; index < command.length; index += 1) {
    const part = command[index];
    if (!part || part === "--") break;
    if (part.startsWith("-")) {
      flags.push(part);
      if (VALUE_FLAGS.has(part)) index += 1;
    }
  }
  return flags;
}

function requestsRawShape(flags: readonly string[]): boolean {
  return flags.some(
    (flag) =>
      RAW_SHAPE_FLAGS.has(flag) ||
      flag.startsWith("--stat=") ||
      flag.startsWith("--dirstat="),
  );
}

function requestsCustomFormat(flags: readonly string[]): boolean {
  return flags.some(
    (flag) =>
      flag === "--oneline" ||
      flag.startsWith("--pretty") ||
      flag.startsWith("--format"),
  );
}

function isSafeCompactFlag(flag: string): boolean {
  if (/^-\d+$/.test(flag)) return true;
  if (
    flag.startsWith("--max-count=") ||
    flag.startsWith("--author=") ||
    flag.startsWith("--committer=") ||
    flag.startsWith("--grep=") ||
    flag.startsWith("--since=") ||
    flag.startsWith("--after=") ||
    flag.startsWith("--until=") ||
    flag.startsWith("--before=") ||
    flag.startsWith("--branches=") ||
    flag.startsWith("--tags=") ||
    flag.startsWith("--remotes=") ||
    flag.startsWith("--glob=") ||
    flag.startsWith("--exclude=") ||
    flag.startsWith("--min-parents=") ||
    flag.startsWith("--max-parents=") ||
    flag.startsWith("--decorate=")
  ) {
    return true;
  }
  return SAFE_COMPACT_FLAGS.has(flag);
}

function hasStructuredLogDetails(lines: readonly string[]): boolean {
  let afterSubject = false;

  for (const line of lines) {
    if (/^commit\s+[0-9a-f]{7,40}/i.test(line)) {
      afterSubject = false;
      continue;
    }
    if (/^Date:\s+/.test(line)) continue;
    if (/^\s{4}\S/.test(line) && !afterSubject) {
      afterSubject = true;
      continue;
    }
    if (
      /^\s+\S.*\|\s+\d+/.test(line) ||
      /^\s*\d+\s+files?\s+changed/.test(line) ||
      /^\d+\s+\d+\s+\S/.test(line) ||
      /^[ACDMRTUXB]\d*\s+\S/.test(line) ||
      (afterSubject &&
        line.trim() &&
        !/^\s/.test(line) &&
        !/^(?:Author|Merge):\s+/.test(line))
    ) {
      return true;
    }
  }
  return false;
}

export function filterGitLog(input: string, options: FilterOptions): FilterResult {
  const cleaned = cleanText(input);
  const lines = cleaned.split("\n");
  const flags = gitLogFlags(options.command ?? []);

  if (
    requestsRawShape(flags) ||
    requestsCustomFormat(flags) ||
    flags.some((flag) => !isSafeCompactFlag(flag)) ||
    lines.some((line) => line.startsWith("diff --git ")) ||
    hasStructuredLogDetails(lines)
  ) {
    const limited = limitLines(lines, options.maxLines);
    return {
      output: limited.lines.join("\n"),
      kind: "git-log",
      omitted: limited.omitted > 0,
      ...(limited.omitted > 0 ? { recovery: "always" as const } : {}),
      notes: limited.omitted > 0
        ? ["explicit Git output format preserved", `omitted ${limited.omitted} output lines`]
        : ["explicit Git output format preserved"],
    };
  }

  if (lines.length > 0 && lines.every((line) => !line.trim() || ONELINE_PATTERN.test(line))) {
    const limited = limitLines(lines.filter(Boolean), options.maxLines);
    return {
      output: limited.lines.join("\n"),
      kind: "git-log",
      omitted: limited.omitted > 0,
      recovery: "always",
      notes: limited.omitted > 0 ? [`omitted ${limited.omitted} commits`] : [],
    };
  }

  const commits: Commit[] = [];
  let current: Commit | undefined;
  let phase: "metadata" | "subject" | "body" = "metadata";

  for (const rawLine of lines) {
    const commitMatch = rawLine.match(/^commit\s+([0-9a-f]{7,40})(?:\s+\(([^)]+)\))?/i);
    if (commitMatch) {
      current = {
        hash: (commitMatch[1] ?? "").slice(0, 10),
        ...(commitMatch[2] ? { refs: commitMatch[2] } : {}),
        body: [],
      };
      commits.push(current);
      phase = "metadata";
      continue;
    }
    if (!current) continue;

    const authorMatch = rawLine.match(/^Author:\s+(.+?)(?:\s+<[^>]+>)?$/);
    const author = authorMatch?.[1];
    if (author) {
      current.author = author.trim();
      continue;
    }

    const dateMatch = rawLine.match(/^Date:\s+(.+)$/);
    const date = dateMatch?.[1];
    if (date) {
      const parsed = new Date(date);
      current.date = Number.isNaN(parsed.valueOf()) ? date.trim() : parsed.toISOString().slice(0, 10);
      phase = "subject";
      continue;
    }

    const content = rawLine.trim();
    if (phase === "subject" && content) {
      current.subject = content;
      phase = "body";
    } else if (phase === "body" && content && !TRAILER_PATTERN.test(content)) {
      current.body.push(content);
    }
  }

  if (commits.length === 0 || commits.some((commit) => !commit.subject)) {
    const limited = limitLines(lines, options.maxLines);
    return {
      output: limited.lines.join("\n"),
      kind: "git-log",
      omitted: limited.omitted > 0,
      recovery: "always",
      notes: ["unrecognized log format; returned cleaned output"],
    };
  }

  let omittedBodyLines = 0;
  const compact = commits.flatMap((commit) => {
    const refs = commit.refs ? ` (${commit.refs})` : "";
    const details = [commit.author, commit.date].filter(Boolean).join(", ");
    const header = `${commit.hash}${refs} ${commit.subject}${details ? ` — ${details}` : ""}`;
    const body = commit.body.slice(0, BODY_LIMIT).map((line) => `  ${line}`);
    const omitted = Math.max(0, commit.body.length - BODY_LIMIT);
    omittedBodyLines += omitted;
    if (omitted > 0) body.push(`  [+${omitted} body ${omitted === 1 ? "line" : "lines"} omitted]`);
    return [header, ...body];
  });
  const limited = limitLines(compact, options.maxLines);
  const meaningfulOmission = omittedBodyLines > 0 || limited.omitted > 0;

  return {
    output: limited.lines.join("\n"),
    kind: "git-log",
    omitted: true,
    recovery: meaningfulOmission ? "always" : "threshold",
    notes:
      limited.omitted > 0
        ? [`omitted verbose metadata and ${limited.omitted} output lines`]
        : omittedBodyLines > 0
          ? [`omitted verbose metadata and ${omittedBodyLines} body lines`]
          : ["omitted verbose metadata"],
  };
}
