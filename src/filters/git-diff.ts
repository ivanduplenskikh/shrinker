import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

interface DiffFile {
  name: string;
  lines: string[];
  additions: number;
  deletions: number;
}

export function filterGitDiff(input: string, options: FilterOptions): FilterResult {
  const lines = cleanText(input).split("\n");
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;

  for (const line of lines) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      current = {
        name: header[2] ?? header[1] ?? "unknown",
        lines: [],
        additions: 0,
        deletions: 0,
      };
      files.push(current);
      continue;
    }
    if (!current) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) current.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;

    if (
      line.startsWith("@@") ||
      (line.startsWith("+") && !line.startsWith("+++")) ||
      (line.startsWith("-") && !line.startsWith("---"))
    ) {
      current.lines.push(line);
    }
  }

  if (files.length === 0) {
    return {
      output: lines.join("\n"),
      kind: "git-diff",
      omitted: false,
      notes: ["unrecognized diff format; returned cleaned output"],
    };
  }

  const output: string[] = [];
  let perFileOmitted = 0;
  for (const file of files) {
    output.push(`${file.name} (+${file.additions} -${file.deletions})`);
    const limited = limitLines(file.lines, options.perFileLines);
    perFileOmitted += limited.omitted;
    output.push(...limited.lines.map((line) => `  ${line}`));
  }

  const limited = limitLines(output, options.maxLines);
  const omitted = perFileOmitted + limited.omitted;

  return {
    output: limited.lines.join("\n"),
    kind: "git-diff",
    omitted: true,
    notes: omitted > 0 ? [`omitted ${omitted} diff lines`] : ["removed diff metadata and context"],
  };
}
