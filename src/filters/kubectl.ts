import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import { filterGenericLog } from "./generic-log.js";
import { compactTable } from "./table.js";
import type { FilterOptions, FilterResult } from "./types.js";

const IMPORTANT_PATTERN = /\b(error|failed|failure|fatal|warn(?:ing)?|exception|panic)\b/i;

function detectSubcommand(command: readonly string[]): string | undefined {
  const index = command.findIndex((part) => /(?:^|[\\/])kubectl(?:\.exe)?$/i.test(part));
  if (index < 0) return undefined;
  return command[index + 1]?.toLowerCase();
}

function getOutputFormat(command: readonly string[]): string | undefined {
  for (let index = 0; index < command.length; index += 1) {
    const part = command[index];
    if (part === "-o" || part === "--output") {
      return command[index + 1]?.toLowerCase();
    }
    if (part?.startsWith("--output=")) {
      return part.slice("--output=".length).toLowerCase();
    }
  }
  return undefined;
}

export function filterKubectlOutput(input: string, options: FilterOptions): FilterResult {
  const command = options.command ?? [];
  const subcommand = detectSubcommand(command);
  const outputFormat = getOutputFormat(command);

  if (outputFormat && ["json", "yaml", "name", "go-template", "go-template-file", "jsonpath", "jsonpath-as-json"].includes(outputFormat)) {
    return {
      output: cleanText(input),
      kind: "kubectl",
      omitted: false,
      notes: ["explicit kubectl output format preserved"],
    };
  }

  if (subcommand === "logs") {
    const result = filterGenericLog(input, options);
    return { ...result, kind: "kubectl" };
  }

  if (subcommand === "get") {
    const table = compactTable(input, options);
    if (table.parsed) {
      return {
        output: table.output,
        kind: "kubectl",
        omitted: table.omitted,
        notes: table.notes,
      };
    }
  }

  if (subcommand === "describe") {
    const lines = cleanText(input).split("\n");
    const kept = lines.filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.startsWith("Name:") ||
        trimmed.startsWith("Namespace:") ||
        trimmed.startsWith("Status:") ||
        trimmed.startsWith("Containers:") ||
        trimmed.startsWith("Conditions:") ||
        trimmed.startsWith("Events:") ||
        IMPORTANT_PATTERN.test(trimmed)
      );
    });

    if (kept.length > 0) {
      const limited = limitLines(kept, options.maxLines);
      return {
        output: limited.lines.join("\n"),
        kind: "kubectl",
        omitted: kept.length < lines.length || limited.omitted > 0,
        notes: ["collapsed kubectl describe details"],
      };
    }
  }

  const fallback = filterGenericLog(input, options);
  return { ...fallback, kind: "kubectl" };
}
