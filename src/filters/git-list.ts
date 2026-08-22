import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

export function filterGitList(input: string, options: FilterOptions): FilterResult {
  const lines = cleanText(input)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\*\s+/, "current: "));

  if (lines.length === 0) {
    return {
      output: cleanText(input),
      kind: "git-list",
      omitted: false,
      notes: ["unrecognized git list format; returned cleaned output"],
    };
  }

  const limited = limitLines(lines, options.maxLines);
  return {
    output: limited.lines.join("\n"),
    kind: "git-list",
    omitted: limited.omitted > 0,
    notes: limited.omitted > 0 ? [`omitted ${limited.omitted} lines`] : [],
  };
}
