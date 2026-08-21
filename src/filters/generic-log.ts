import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

const PROGRESS_PATTERN =
  /^(?:\s*\d{1,3}%|progress\b|downloading\b|uploading\b|building\b|compiling\b|waiting\b|\.{3,}|[=\-#>.]{8,})/i;
const IMPORTANT_PATTERN = /\b(error|failed|failure|fatal|warn(?:ing)?|exception|panic)\b/i;

export function filterGenericLog(input: string, options: FilterOptions): FilterResult {
  const lines = cleanText(input).split("\n");
  const compact: string[] = [];
  let progressLines = 0;

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? "";
    let count = 1;

    while (lines[index + count] === line) {
      count += 1;
    }

    if (PROGRESS_PATTERN.test(line) && !IMPORTANT_PATTERN.test(line)) {
      progressLines += count;
    } else if (count >= 3) {
      compact.push(`${line} [repeated ${count}x]`);
    } else {
      compact.push(...lines.slice(index, index + count));
    }

    index += count;
  }

  if (progressLines > 0) {
    compact.unshift(`[${progressLines} progress lines collapsed]`);
  }

  const limited = limitLines(compact, options.maxLines);
  const omitted = progressLines > 0 || limited.omitted > 0 || compact.length < lines.length;

  return {
    output: limited.lines.join("\n"),
    kind: "log",
    omitted,
    notes: progressLines > 0 ? [`collapsed ${progressLines} progress lines`] : [],
  };
}
