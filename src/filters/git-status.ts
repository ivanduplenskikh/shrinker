import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

const SECTION_MAP: Array<[RegExp, string]> = [
  [/^Changes to be committed:/i, "staged"],
  [/^Changes not staged for commit:/i, "unstaged"],
  [/^Untracked files:/i, "untracked"],
  [/^Unmerged paths:/i, "conflicts"],
];

export function filterGitStatus(input: string, options: FilterOptions): FilterResult {
  const lines = cleanText(input).split("\n");
  const branch: string[] = [];
  const groups = new Map<string, string[]>();
  let currentSection: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (
      line.startsWith("(") ||
      line.startsWith("no changes added") ||
      line.startsWith("nothing to commit")
    ) {
      continue;
    }

    const section = SECTION_MAP.find(([pattern]) => pattern.test(line));
    if (section) {
      currentSection = section[1];
      continue;
    }

    if (
      line.startsWith("On branch ") ||
      line.startsWith("Your branch ") ||
      line.startsWith("HEAD detached")
    ) {
      branch.push(line.replace(/^On branch /, "branch: "));
      continue;
    }

    const fileMatch = line.match(
      /^(modified|new file|deleted|renamed|copied|both modified|added by us|deleted by them):\s+(.+)$/i,
    );
    if (fileMatch) {
      const state = fileMatch[1] ?? "changed";
      const path = fileMatch[2] ?? line;
      const group = currentSection ?? "changed";
      groups.set(group, [...(groups.get(group) ?? []), `${state}: ${path}`]);
      continue;
    }

    if (currentSection === "untracked" && !line.startsWith("(")) {
      groups.set("untracked", [...(groups.get("untracked") ?? []), line]);
    }
  }

  const output: string[] = [...branch];
  for (const [name, files] of groups) {
    output.push(`${name} (${files.length}):`);
    output.push(...files.map((file) => `  ${file}`));
  }

  if (output.length === 0) {
    return {
      output: lines.join("\n"),
      kind: "git-status",
      omitted: false,
      notes: ["unrecognized status format; returned cleaned output"],
    };
  }

  const limited = limitLines(output, options.maxLines);
  return {
    output: limited.lines.join("\n"),
    kind: "git-status",
    omitted: limited.omitted > 0 || output.join("\n").length < cleanText(input).length,
    notes: [],
  };
}
