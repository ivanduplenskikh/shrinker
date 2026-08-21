import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

interface Commit {
  hash: string;
  refs?: string;
  author?: string;
  date?: string;
  subject?: string;
}

const ONELINE_PATTERN = /^[0-9a-f]{7,40}(?:\s+\([^)]+\))?\s+\S/i;

export function filterGitLog(input: string, options: FilterOptions): FilterResult {
  const cleaned = cleanText(input);
  const lines = cleaned.split("\n");

  if (lines.length > 0 && lines.every((line) => !line.trim() || ONELINE_PATTERN.test(line))) {
    const limited = limitLines(lines.filter(Boolean), options.maxLines);
    return {
      output: limited.lines.join("\n"),
      kind: "git-log",
      omitted: limited.omitted > 0,
      notes: limited.omitted > 0 ? [`omitted ${limited.omitted} commits`] : [],
    };
  }

  const commits: Commit[] = [];
  let current: Commit | undefined;
  let waitingForSubject = false;

  for (const rawLine of lines) {
    const commitMatch = rawLine.match(/^commit\s+([0-9a-f]{7,40})(?:\s+\(([^)]+)\))?/i);
    if (commitMatch) {
      current = {
        hash: (commitMatch[1] ?? "").slice(0, 10),
        ...(commitMatch[2] ? { refs: commitMatch[2] } : {}),
      };
      commits.push(current);
      waitingForSubject = false;
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
      waitingForSubject = true;
      continue;
    }

    if (waitingForSubject && rawLine.trim()) {
      current.subject = rawLine.trim();
      waitingForSubject = false;
    }
  }

  if (commits.length === 0 || commits.some((commit) => !commit.subject)) {
    const limited = limitLines(lines, options.maxLines);
    return {
      output: limited.lines.join("\n"),
      kind: "git-log",
      omitted: limited.omitted > 0,
      notes: ["unrecognized log format; returned cleaned output"],
    };
  }

  const compact = commits.map((commit) => {
    const refs = commit.refs ? ` (${commit.refs})` : "";
    const details = [commit.author, commit.date].filter(Boolean).join(", ");
    return `${commit.hash}${refs} ${commit.subject}${details ? ` — ${details}` : ""}`;
  });
  const limited = limitLines(compact, options.maxLines);

  return {
    output: limited.lines.join("\n"),
    kind: "git-log",
    omitted: true,
    notes:
      limited.omitted > 0
        ? [`omitted commit bodies and ${limited.omitted} commits`]
        : ["omitted commit bodies and verbose metadata"],
  };
}
