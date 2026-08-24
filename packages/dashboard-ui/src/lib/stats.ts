// Mirrors the CLI types in src/metrics/stats-store.ts; kept in sync by tests/dashboard-payload.test.ts.
export interface StatsRow {
  filterKind: string;
  runs: number;
  rawEstimatedTokens: number;
  outputEstimatedTokens: number;
  estimatedTokensSaved: number;
  estimatedInputCostSavedUsd: number;
  reductionPercent: number;
}

export interface DailyStatsRow {
  date: string;
  runs: number;
  estimatedTokensSaved: number;
  reductionPercent: number;
}

export interface CommandStatsRow {
  command: string;
  calls: number;
  estimatedTokensSaved: number;
  reductionPercent: number;
}

export interface UncoveredRow {
  command: string;
  executable: string;
  subcommand?: string;
  occurrences: number;
  estimatedTokens: number;
  averageTokens: number;
  reasons: string[];
  sources: string[];
  lastSeen: string;
}

export interface StatsSummary {
  databasePath: string;
  total: StatsRow;
  last7Days: StatsRow;
  byFilter: StatsRow[];
  daily: DailyStatsRow[];
  yearlyDaily: DailyStatsRow[];
  byCommand: CommandStatsRow[];
  uncovered: UncoveredRow[];
  uncoveredTrackingEnabled: boolean;
}

export interface DashboardPayload {
  summary: StatsSummary;
  inputCostPerMillionTokens: number;
}

const EMPTY_ROW: StatsRow = {
  filterKind: "all",
  runs: 0,
  rawEstimatedTokens: 0,
  outputEstimatedTokens: 0,
  estimatedTokensSaved: 0,
  estimatedInputCostSavedUsd: 0,
  reductionPercent: 0,
};

export const EMPTY_PAYLOAD: DashboardPayload = {
  summary: {
    databasePath: "",
    total: EMPTY_ROW,
    last7Days: EMPTY_ROW,
    byFilter: [],
    daily: [],
    yearlyDaily: [],
    byCommand: [],
    uncovered: [],
    uncoveredTrackingEnabled: false,
  },
  inputCostPerMillionTokens: 5,
};

export function readEmbeddedPayload(): DashboardPayload {
  const node = document.querySelector("#shrinker-stats");
  if (!node?.textContent) return EMPTY_PAYLOAD;
  try {
    return JSON.parse(node.textContent) as DashboardPayload;
  } catch {
    // Unreplaced placeholder during `vite dev`.
    return EMPTY_PAYLOAD;
  }
}

const integerFormatter = new Intl.NumberFormat("en-US");

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

export function formatUsd(value: number): string {
  return currencyFormatter.format(value);
}
