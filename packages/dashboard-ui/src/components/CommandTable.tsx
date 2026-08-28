import { Chip } from "@heroui/react";
import type { CommandStat, UncoveredRow } from "../types";

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

export function CommandTable({
  rows,
  uncovered,
  observedReductionPercent,
}: {
  rows: CommandStat[];
  uncovered: UncoveredRow[];
  observedReductionPercent: number;
}) {
  const totalRows = rows.length + uncovered.length;
  const estimatedReductionPercent = Math.min(100, Math.max(0, observedReductionPercent));
  return (
    <div className="table-wrap">
      <table className="command-table">
        <caption className="sr-only">Top commands</caption>
        <thead>
          <tr>
            <th scope="col">COMMAND</th>
            <th scope="col">FILTER</th>
            <th className="numeric" scope="col">
              RUNS
            </th>
            <th className="numeric" scope="col">
              ORIGINAL
            </th>
            <th className="numeric" scope="col">
              SAVED
            </th>
            <th className="numeric" scope="col">
              REDUCTION
            </th>
            <th scope="col">STATUS</th>
          </tr>
        </thead>
        <tbody>
          {totalRows === 0 ? (
            <tr>
              <td colSpan={7}>No command data yet.</td>
            </tr>
          ) : (
            <>
              {rows.map((row) => (
                <tr key={`${row.command}-${row.filterKind}`}>
                  <td>
                    <code>{row.command}</code>
                  </td>
                  <td>
                    <Chip size="sm" variant="secondary">
                      {row.filterKind}
                    </Chip>
                  </td>
                  <td className="numeric">{formatNumber(row.calls)}</td>
                  <td className="numeric">{formatNumber(row.rawEstimatedTokens)}</td>
                  <td className="numeric">{formatNumber(row.estimatedTokensSaved)}</td>
                  <td className="numeric">{row.reductionPercent}%</td>
                  <td>
                    <Chip size="sm" color="success" variant="secondary">
                      Captured
                    </Chip>
                  </td>
                </tr>
              ))}
              {uncovered.map((row) => (
                <tr className="missed-filter" key={`uncovered-${row.command}`}>
                  <td>
                    <code>{row.command}</code>
                  </td>
                  <td>
                    <Chip size="sm" color="danger" variant="secondary">
                      Missed filter
                    </Chip>
                    <span className="table-detail">{row.reasons.join(", ")}</span>
                  </td>
                  <td className="numeric">{formatNumber(row.occurrences)}</td>
                  <td className="numeric">{formatNumber(row.estimatedTokens)}</td>
                  <td
                    className="numeric estimated-value"
                    title="Estimated from the observed overall reduction"
                  >
                    ~{formatNumber(Math.round(row.estimatedTokens * estimatedReductionPercent / 100))}
                  </td>
                  <td
                    className="numeric estimated-value"
                    title="Estimated from the observed overall reduction"
                  >
                    ~{estimatedReductionPercent}%
                  </td>
                  <td>
                    <Chip size="sm" color="danger" variant="secondary">
                      Needs filter
                    </Chip>
                  </td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
