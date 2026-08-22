import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions } from "./types.js";

function hasWideSpacing(line: string): boolean {
  return /\S\s{2,}\S/.test(line);
}

export function compactTable(
  input: string,
  options: FilterOptions,
): { output: string; omitted: boolean; notes: string[]; parsed: boolean } {
  const lines = cleanText(input).split("\n").filter((line) => line.trim());
  if (lines.length < 2 || !hasWideSpacing(lines[0] ?? "")) {
    return { output: cleanText(input), omitted: false, notes: [], parsed: false };
  }

  const header = lines[0] ?? "";
  const rows = lines.slice(1);
  const rowLimit = Math.max(1, options.maxLines - 2);
  const visibleRows = rows.slice(0, rowLimit);

  const output = [header, ...visibleRows];
  if (rows.length > visibleRows.length) {
    output.push(`... ${rows.length - visibleRows.length} rows omitted ...`);
  }

  const limited = limitLines(output, options.maxLines);
  return {
    output: limited.lines.join("\n"),
    omitted: rows.length > visibleRows.length || limited.omitted > 0,
    notes: rows.length > visibleRows.length ? [`omitted ${rows.length - visibleRows.length} rows`] : [],
    parsed: true,
  };
}
