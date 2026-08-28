export interface DailyStat {
  date: string;
  estimatedTokensSaved: number;
}

export interface CommandStat {
  command: string;
  filterKind: string;
  calls: number;
  estimatedTokensSaved: number;
  reductionPercent: number;
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
}

export interface StatsPayload {
  summary: Summary;
}
