import { cleanText } from "../formatting/ansi.js";
import { limitLines } from "../formatting/limits.js";
import type { FilterOptions, FilterResult } from "./types.js";

const IMPORTANT_PATTERN = /(?:npm\s+ERR!|\berror\b|\bfailed\b|\bfailure\b|\bfatal\b|\bwarn(?:ing)?\b|\bexception\b|\bpanic\b)/i;
const SUMMARY_PATTERN = /\b(added|removed|changed|audited|vulnerabilities?|packages?|dependencies|found\s+0\s+vulnerabilities)\b/i;
const NOISE_PATTERN = /^(?:npm\s+notice\s+|npm\s+timing\s+|npm\s+http\s+|npm\s+verb\s+|\s*[\|/\\-]+\s*$|\s*\d+%\s*$)/i;

export function filterNpmOutput(input: string, options: FilterOptions): FilterResult {
  const lines = cleanText(input).split("\n");
  const kept: string[] = [];
  let noiseLines = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (IMPORTANT_PATTERN.test(line)) {
      kept.push(line);
      continue;
    }
    if (SUMMARY_PATTERN.test(line)) {
      kept.push(line);
      continue;
    }
    if (NOISE_PATTERN.test(line)) {
      noiseLines += 1;
    }
  }

  if (noiseLines > 0) {
    kept.unshift(`[${noiseLines} npm noise lines collapsed]`);
  }

  if (kept.length === 0) {
    return {
      output: lines.join("\n"),
      kind: "npm",
      omitted: false,
      notes: ["unrecognized npm format; returned cleaned output"],
    };
  }

  const limited = limitLines(kept, options.maxLines);
  return {
    output: limited.lines.join("\n"),
    kind: "npm",
    omitted: noiseLines > 0 || limited.omitted > 0 || kept.length < lines.length,
    notes: noiseLines > 0 ? [`collapsed ${noiseLines} npm noise lines`] : [],
  };
}
