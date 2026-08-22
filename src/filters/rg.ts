import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

interface MatchLine {
  line: number;
  text: string;
}

function requestsStructuredOutput(command: readonly string[]): boolean {
  return command.some((part) => part === "--json" || part.startsWith("--json="));
}

export function filterRgOutput(input: string, options: FilterOptions): FilterResult {
  const cleaned = cleanText(input);
  const lines = cleaned.split("\n");

  if (requestsStructuredOutput(options.command ?? [])) {
    return {
      output: cleaned,
      kind: "rg",
      omitted: false,
      notes: ["explicit rg structured output preserved"],
    };
  }

  const byFile = new Map<string, MatchLine[]>();
  let parseable = 0;

  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) continue;
    const filePath = match[1] ?? "";
    const lineNumber = Number.parseInt(match[2] ?? "0", 10);
    const body = match[3] ?? "";
    if (!filePath || !Number.isFinite(lineNumber) || lineNumber <= 0) continue;

    const list = byFile.get(filePath) ?? [];
    list.push({ line: lineNumber, text: body.trim() });
    byFile.set(filePath, list);
    parseable += 1;
  }

  if (parseable === 0) {
    return {
      output: cleaned,
      kind: "rg",
      omitted: false,
      notes: ["unrecognized rg format; returned cleaned output"],
    };
  }

  const files = [...byFile.entries()].sort((left, right) => right[1].length - left[1].length);
  const output: string[] = [`matches: ${parseable} in ${files.length} files`];
  let omittedMatches = 0;

  for (const [filePath, matches] of files) {
    output.push(`${filePath} (${matches.length})`);
    const visible = matches.slice(0, Math.max(1, options.perFileLines));
    for (const item of visible) {
      output.push(`  ${item.line}: ${item.text}`);
    }
    if (matches.length > visible.length) {
      const hidden = matches.length - visible.length;
      omittedMatches += hidden;
      output.push(`  ... ${hidden} matches omitted ...`);
    }
  }

  const limited = limitLines(output, options.maxLines);
  return {
    output: limited.lines.join("\n"),
    kind: "rg",
    omitted: omittedMatches > 0 || limited.omitted > 0,
    notes: omittedMatches > 0 ? [`omitted ${omittedMatches} rg matches`] : [],
  };
}
