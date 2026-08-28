import { Chip } from "@heroui/react";
import type { CommandStat } from "../types";

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

export function CommandTable({ rows }: { rows: CommandStat[] }) {
  return (
    <div className="table-wrap">
      <table className="command-table">
        <caption className="sr-only">Top commands</caption>
        <thead>
          <tr>
            <th scope="col">COMMAND</th>
            <th scope="col">FILTER</th>
            <th className="numeric" scope="col">RUNS</th>
            <th className="numeric" scope="col">SAVED</th>
            <th className="numeric" scope="col">REDUCTION</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>No command data yet.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.command}-${row.filterKind}`}>
                <td><code>{row.command}</code></td>
                <td><Chip size="sm" variant="secondary">{row.filterKind}</Chip></td>
                <td className="numeric">{formatNumber(row.calls)}</td>
                <td className="numeric">{formatNumber(row.estimatedTokensSaved)}</td>
                <td className="numeric">{row.reductionPercent}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
