import { useState } from "react";
import { Badge } from "@/components/ui/badge"

import type { CommandStat, UncoveredRow } from "../types";

type SortKey = "command" | "filter" | "runs" | "original" | "saved" | "reduction";
type SortDirection = "ascending" | "descending";
type TableTab = "covered" | "uncovered";

interface TableRow {
  key: string;
  command: string;
  filter: string;
  runs: number;
  original: number;
  saved: number | null;
  reduction: number | null;
  reasons: string[];
}

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

export function CommandTable({
  rows,
  uncovered,
  selectedCommand,
  onSelectCommand,
}: {
  rows: CommandStat[];
  uncovered: UncoveredRow[];
  selectedCommand: string | null;
  onSelectCommand: (command: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "saved",
    direction: "descending",
  });
  const [activeTab, setActiveTab] = useState<TableTab>("covered");
  const coveredRows: TableRow[] = rows.map((row) => ({
      key: `${row.command}-${row.filterKind}`,
      command: row.command,
      filter: row.filterKind,
      runs: row.calls,
      original: row.rawEstimatedTokens,
      saved: row.estimatedTokensSaved,
      reduction: row.reductionPercent,
      reasons: [],
    }));
  const uncoveredRows: TableRow[] = uncovered.map((row) => ({
      key: `uncovered-${row.command}`,
      command: row.command,
      filter: "Missed filter",
      runs: row.occurrences,
      original: row.estimatedTokens,
      saved: null,
      reduction: null,
      reasons: row.reasons,
    }));
  const tableRows = activeTab === "covered" ? coveredRows : uncoveredRows;
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
    <>
      <div aria-label="Command coverage" className="command-tabs" role="tablist">
        <button aria-controls="covered-commands" aria-selected={activeTab === "covered"} onClick={() => setActiveTab("covered")} role="tab" type="button">Covered <span>{coveredRows.length}</span></button>
        <button aria-controls="uncovered-commands" aria-selected={activeTab === "uncovered"} onClick={() => setActiveTab("uncovered")} role="tab" type="button">Uncovered <span>{uncoveredRows.length}</span></button>
      </div>
      <div className="table-wrap" id={`${activeTab}-commands`} role="tabpanel">
      <table className="command-table">
        <caption className="sr-only">{activeTab === "covered" ? "Covered commands" : "Uncovered commands"}</caption>
        <thead>
          <tr>
            <th scope="col">{heading("COMMAND", "command")}</th>
            <th scope="col">{heading("FILTER", "filter")}</th>
            <th scope="col">{heading("RUNS", "runs", true)}</th>
            <th scope="col">{heading("ORIGINAL", "original", true)}</th>
            <th scope="col">{heading("SAVED", "saved", true)}</th>
            <th scope="col">{heading("REDUCTION", "reduction", true)}</th>
          </tr>
        </thead>
        <tbody>
          {totalRows === 0 ? (
            <tr>
              <td colSpan={6}>No {activeTab} command data yet.</td>
            </tr>
          ) : (
            <>
              {sortedRows.map((row) => (
                <tr
                  aria-pressed={selectedCommand === row.command}
                  className={`${activeTab === "uncovered" ? "missed-filter " : ""}command-row${selectedCommand === row.command ? " selected" : ""}`}
                  key={row.key}
                  onClick={() => onSelectCommand(row.command)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectCommand(row.command);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td><code>{row.command}</code></td>
                  <td>
                    <Badge variant={activeTab === "uncovered" ? "destructive" : "secondary"}>{row.filter}</Badge>
                    {row.reasons.length > 0 && <span className="table-detail">{row.reasons.join(", ")}</span>}
                  </td>
                  <td className="numeric">{formatNumber(row.runs)}</td>
                  <td className="numeric">{formatNumber(row.original)}</td>
                  <td className="numeric">{row.saved === null ? "" : formatNumber(row.saved)}</td>
                  <td className="numeric">{row.reduction === null ? "" : `${row.reduction}%`}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}
