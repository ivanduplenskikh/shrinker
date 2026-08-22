import { cleanText } from "../formatting/ansi.js";
import { filterGenericLog } from "./generic-log.js";
import { compactTable } from "./table.js";
import type { FilterOptions, FilterResult } from "./types.js";

function hasOption(command: readonly string[], ...names: string[]): boolean {
  return command.some((part) => names.includes(part));
}

function detectSubcommand(command: readonly string[]): string | undefined {
  const index = command.findIndex((part) => /(?:^|[\\/])docker(?:\.exe)?$/i.test(part));
  if (index < 0) return undefined;
  return command[index + 1]?.toLowerCase();
}

export function filterDockerOutput(input: string, options: FilterOptions): FilterResult {
  const command = options.command ?? [];
  const subcommand = detectSubcommand(command);

  if (hasOption(command, "--format", "-f", "--quiet", "-q")) {
    return {
      output: cleanText(input),
      kind: "docker",
      omitted: false,
      notes: ["explicit docker format preserved"],
    };
  }

  if (subcommand === "logs" || subcommand === "attach") {
    const result = filterGenericLog(input, options);
    return { ...result, kind: "docker" };
  }

  if (subcommand === "ps" || subcommand === "images" || subcommand === "container" || subcommand === "volume" || subcommand === "network") {
    const table = compactTable(input, options);
    if (table.parsed) {
      return {
        output: table.output,
        kind: "docker",
        omitted: table.omitted,
        notes: table.notes,
      };
    }
  }

  const fallback = filterGenericLog(input, options);
  return { ...fallback, kind: "docker" };
}
