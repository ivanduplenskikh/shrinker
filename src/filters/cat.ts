import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

export function filterCatOutput(input: string, options: FilterOptions): FilterResult {
  const lines = cleanText(input).split("\n");
  const limited = limitLines(lines, options.maxLines);

  return {
    output: limited.lines.join("\n"),
    kind: "cat",
    omitted: limited.omitted > 0,
    notes: limited.omitted > 0 ? [`omitted ${limited.omitted} lines`] : [],
  };
}
