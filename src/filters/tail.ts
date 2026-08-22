import { filterGenericLog } from "./generic-log.js";
import type { FilterOptions, FilterResult } from "./types.js";

export function filterTailOutput(input: string, options: FilterOptions): FilterResult {
  const result = filterGenericLog(input, options);
  return { ...result, kind: "tail" };
}
