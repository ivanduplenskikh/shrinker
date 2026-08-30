export interface DailyStat {
  date: string;
  estimatedTokensSaved: number;
}

export interface CommandStat {
  command: string;
  filterKind: string;
  calls: number;
  rawEstimatedTokens: number;
  estimatedTokensSaved: number;
  reductionPercent: number;
}

export interface UncoveredRow {
  command: string;
  occurrences: number;
  estimatedTokens: number;
  reasons: string[];
}

export interface CommandRun {
  command: string;
  createdAt: string;
  rawEstimatedTokens: number;
  outputEstimatedTokens: number;
  estimatedTokensSaved: number;
  status: string;
}

export interface Summary {
  databasePath: string;
  total: {
    runs: number;
    estimatedTokensSaved: number;
    reductionPercent: number;
  };
  last7Days: {
    estimatedTokensSaved: number;
  };
  daily: DailyStat[];
  byCommand: CommandStat[];
  uncovered: UncoveredRow[];
  commandRuns: CommandRun[];
}

export interface StatsPayload {
  summary: Summary;
}
