export type FilterKind =
  | "auto"
  | "git-status"
  | "git-diff"
  | "git-log"
  | "test"
  | "log";

export interface FilterOptions {
  maxLines: number;
  perFileLines: number;
}

export interface FilterResult {
  output: string;
  kind: Exclude<FilterKind, "auto">;
  omitted: boolean;
  notes: string[];
}

export type OutputFilter = (input: string, options: FilterOptions) => FilterResult;
