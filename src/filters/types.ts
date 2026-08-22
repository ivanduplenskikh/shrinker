export type FilterKind =
  | "auto"
  | "git-status"
  | "git-diff"
  | "git-log"
  | "git-list"
  | "npm"
  | "tail"
  | "find"
  | "rg"
  | "docker"
  | "kubectl"
  | "cat"
  | "gh"
  | "test"
  | "log";

export interface FilterOptions {
  maxLines: number;
  perFileLines: number;
  command?: readonly string[];
}

export interface FilterResult {
  output: string;
  kind: Exclude<FilterKind, "auto">;
  omitted: boolean;
  recovery?: "always" | "threshold";
  notes: string[];
}

export type OutputFilter = (input: string, options: FilterOptions) => FilterResult;
