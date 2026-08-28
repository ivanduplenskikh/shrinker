import { Chip } from "@heroui/react";
import type { CommandStat } from "../types";

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

export function CommandTable({ rows }: { rows: CommandStat[] }) {
  return <div className="table-wrap"><table><caption className="sr-only">Top commands</caption><thead><tr><th scope="col">COMMAND</th><th scope="col">FILTER</th><th scope="col">RUNS</th><th scope="col">SAVED</th><th scope="col">REDUCTION</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={5}>No command data yet.</td></tr> : rows.map((row) => <tr key={`${row.command}-${row.filterKind}`}><td><code>{row.command}</code></td><td><Chip size="sm" variant="secondary">{row.filterKind}</Chip></td><td>{formatNumber(row.calls)}</td><td>{formatNumber(row.estimatedTokensSaved)}</td><td>{row.reductionPercent}%</td></tr>)}</tbody></table></div>;
}
