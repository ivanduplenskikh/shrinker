import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

const IMPORTANT =
  /\b(fail(?:ed|ure|ing)?|error|exception|panic|expected|received|assert(?:ion)?|×|✕|not ok)\b/i;
const SUMMARY =
  /\b(tests?|suites?|passed|failed|skipped|duration|time|snapshots?|collected)\b/i;
const PASS_LINE = /^\s*(?:✓|✔|ok\b|pass(?:ed)?\b|\.{2,})/i;

export function filterTestOutput(input: string, options: FilterOptions): FilterResult {
  const lines = cleanText(input).split("\n");
  const kept: string[] = [];
  let passingLines = 0;
  let inFailure = false;
  let failureContext = 0;

  for (const line of lines) {
    if (IMPORTANT.test(line)) {
      inFailure = true;
      failureContext = 8;
      kept.push(line);
      continue;
    }

    if (inFailure && failureContext > 0) {
      if (line.trim() || failureContext >= 6) kept.push(line);
      failureContext -= 1;
      if (failureContext === 0) inFailure = false;
      continue;
    }

    if (PASS_LINE.test(line)) {
      passingLines += 1;
    } else if (SUMMARY.test(line)) {
      kept.push(line);
    }
  }

  if (passingLines > 0) {
    kept.unshift(`[${passingLines} passing-detail lines collapsed]`);
  }

  if (kept.length === 0) {
    return {
      output: lines.join("\n"),
      kind: "test",
      omitted: false,
      notes: ["unrecognized test format; returned cleaned output"],
    };
  }

  const deduplicated = kept.filter((line, index) => index === 0 || line !== kept[index - 1]);
  const limited = limitLines(deduplicated, options.maxLines);

  return {
    output: limited.lines.join("\n"),
    kind: "test",
    omitted: passingLines > 0 || limited.omitted > 0 || kept.length < lines.length,
    notes: passingLines > 0 ? [`collapsed ${passingLines} passing lines`] : [],
  };
}
