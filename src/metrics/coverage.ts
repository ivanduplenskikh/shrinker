import type { FilterKind } from "../filters/types.js";
import type { Measurements } from "./measure.js";

export type UncoveredSource = "wrapped" | "shell";
export type UncoveredReason = "no-filter" | "low-reduction" | "unlisted-subcommand";

export interface CommandSignature {
  executable: string;
  subcommand?: string;
}

const DEFAULT_LOW_REDUCTION_PERCENT = 10;
const MINIMUM_TRACKED_RAW_TOKENS = 200;
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9._+-]{0,63}$/;

const OPTION_VALUE_FLAGS: Record<string, readonly string[]> = {
  git: ["-C", "-c", "--git-dir", "--work-tree", "--namespace"],
  npm: ["--prefix", "--cache", "--registry", "--workspace", "--userconfig", "-w", "-C"],
  pnpm: ["--prefix", "--registry", "--workspace", "-w", "-C", "--dir"],
  yarn: ["--cwd", "--registry"],
  docker: ["-H", "--host", "--context", "--config"],
  kubectl: ["-n", "--namespace", "-o", "--output", "--context", "--kubeconfig", "--cluster", "--user"],
  gh: ["-R", "--repo"],
};

export function isCoverageTrackingEnabled(): boolean {
  const configured = process.env['SHRINKER_TRACK_UNCOVERED']?.trim().toLowerCase();
  return configured === "1" || configured === "true" || configured === "yes";
}

function lowReductionPercent(): number {
  const configured = Number(process.env['SHRINKER_LOW_REDUCTION_PERCENT']);
  return Number.isFinite(configured) && configured >= 0 && configured <= 100
    ? configured
    : DEFAULT_LOW_REDUCTION_PERCENT;
}

export function sanitizeToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return TOKEN_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizeExecutable(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const base = value
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.(exe|cmd|bat|ps1)$/i, "");
  return sanitizeToken(base);
}

export function commandSignature(command: readonly string[]): CommandSignature | undefined {
  const executable = normalizeExecutable(command[0]);
  if (!executable) return undefined;

  const valueFlags = new Set(OPTION_VALUE_FLAGS[executable] ?? []);
  for (let index = 1; index < command.length; index += 1) {
    const part = command[index];
    if (!part) continue;
    if (valueFlags.has(part)) {
      index += 1;
      continue;
    }
    if (part.startsWith("-")) continue;
    const subcommand = sanitizeToken(part);
    return subcommand ? { executable, subcommand } : { executable };
  }

  return { executable };
}

export interface WrappedRunClassification {
  matched: boolean;
  kind: Exclude<FilterKind, "auto">;
  measurements: Measurements;
}

export function classifyWrappedRun(run: WrappedRunClassification): UncoveredReason | undefined {
  if (run.measurements.rawEstimatedTokens < MINIMUM_TRACKED_RAW_TOKENS) return undefined;
  if (!run.matched) return "no-filter";
  if (run.measurements.reductionPercent < lowReductionPercent()) return "low-reduction";
  return undefined;
}
