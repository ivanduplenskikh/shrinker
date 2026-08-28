import { Chip } from "@heroui/react";
import { useState } from "react";
import type { CommandStat, UncoveredRow } from "../types";

type SortKey = "command" | "filter" | "runs" | "original" | "saved" | "reduction" | "status";
type SortDirection = "ascending" | "descending";

interface TableRow {
  kind: "captured" | "uncovered";
  key: string;
  command: string;
  filter: string;
  runs: number;
  original: number;
  saved: number | null;
  reduction: number | null;
  status: string;
  reasons: string[];
}

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

export function CommandTable({
  rows,
  uncovered,
}: {
  rows: CommandStat[];
  uncovered: UncoveredRow[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "saved",
    direction: "descending",
  });
  const tableRows: TableRow[] = [
    ...rows.map((row) => ({
      kind: "captured" as const,
      key: `${row.command}-${row.filterKind}`,
      command: row.command,
      filter: row.filterKind,
      runs: row.calls,
      original: row.rawEstimatedTokens,
      saved: row.estimatedTokensSaved,
      reduction: row.reductionPercent,
      status: "Captured",
      reasons: [],
    })),
    ...uncovered.map((row) => ({
      kind: "uncovered" as const,
      key: `uncovered-${row.command}`,
      command: row.command,
      filter: "Missed filter",
      runs: row.occurrences,
      original: row.estimatedTokens,
      saved: null,
      reduction: null,
      status: "Needs filter",
      reasons: row.reasons,
    })),
  ];
  const sortedRows = [...tableRows].sort((first, second) => {
    const firstValue = first[sort.key === "filter" ? "filter" : sort.key];
    const secondValue = second[sort.key === "filter" ? "filter" : sort.key];
    if (firstValue === secondValue) return first.key.localeCompare(second.key);
    if (firstValue === null) return 1;
    if (secondValue === null) return -1;
    const comparison = typeof firstValue === "number" && typeof secondValue === "number"
      ? firstValue - secondValue
      : String(firstValue).localeCompare(String(secondValue));
    return sort.direction === "ascending" ? comparison : -comparison;
  });
  const totalRows = sortedRows.length;
  const sortBy = (key: SortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "ascending" ? "descending" : "ascending",
  }));
  const heading = (label: string, key: SortKey, numeric = false) => (
    <button className={numeric ? "table-sort numeric" : "table-sort"} type="button" onClick={() => sortBy(key)}>
      {label}{sort.key === key && <span aria-hidden="true"> {sort.direction === "ascending" ? "^" : "v"}</span>}
    </button>
  );
  return (
    <div className="table-wrap">
      <table className="command-table">
        <caption className="sr-only">Top commands</caption>
        <thead>
          <tr>
            <th scope="col">{heading("COMMAND", "command")}</th>
            <th scope="col">{heading("FILTER", "filter")}</th>
            <th scope="col">{heading("RUNS", "runs", true)}</th>
            <th scope="col">{heading("ORIGINAL", "original", true)}</th>
            <th scope="col">{heading("SAVED", "saved", true)}</th>
            <th scope="col">{heading("REDUCTION", "reduction", true)}</th>
            <th scope="col">{heading("STATUS", "status")}</th>
          </tr>
        </thead>
        <tbody>
          {totalRows === 0 ? (
            <tr>
              <td colSpan={7}>No command data yet.</td>
            </tr>
          ) : (
            <>
              {sortedRows.map((row) => (
                <tr className={row.kind === "uncovered" ? "missed-filter" : undefined} key={row.key}>
                  <td><code>{row.command}</code></td>
                  <td>
                    <Chip size="sm" color={row.kind === "uncovered" ? "danger" : undefined} variant="secondary">{row.filter}</Chip>
                    {row.reasons.length > 0 && <span className="table-detail">{row.reasons.join(", ")}</span>}
                  </td>
                  <td className="numeric">{formatNumber(row.runs)}</td>
                  <td className="numeric">{formatNumber(row.original)}</td>
                  <td className="numeric">{row.saved === null ? "" : formatNumber(row.saved)}</td>
                  <td className="numeric">{row.reduction === null ? "" : `${row.reduction}%`}</td>
                  <td><Chip size="sm" color={row.kind === "uncovered" ? "danger" : "success"} variant="secondary">{row.status}</Chip></td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
