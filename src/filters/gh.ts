import { cleanText } from "../formatting/ansi.js";
import { filterGenericLog } from "./generic-log.js";
import { compactTable } from "./table.js";
import type { FilterOptions, FilterResult } from "./types.js";

function hasStructuredOutput(command: readonly string[]): boolean {
  for (let index = 0; index < command.length; index += 1) {
    const part = command[index];
    if (!part) continue;
    if (part === "--json" || part === "--template" || part === "--jq") return true;
    if (part.startsWith("--json=") || part.startsWith("--template=") || part.startsWith("--jq=")) {
      return true;
    }
  }
  return false;
}

export function filterGhOutput(input: string, options: FilterOptions): FilterResult {
  if (hasStructuredOutput(options.command ?? [])) {
    return {
      output: cleanText(input),
      kind: "gh",
      omitted: false,
      notes: ["explicit gh structured output preserved"],
    };
  }

  const table = compactTable(input, options);
  if (table.parsed) {
    return {
      output: table.output,
      kind: "gh",
      omitted: table.omitted,
      notes: table.notes,
    };
  }

  const fallback = filterGenericLog(input, options);
  return { ...fallback, kind: "gh" };
}
