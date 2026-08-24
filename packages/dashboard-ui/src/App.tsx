import { CostRateInput } from "./components/CostRateInput";
import { DataPanel } from "./components/DataPanel";
import { SavingsHeatmap } from "./components/SavingsHeatmap";
import { StatCards } from "./components/StatCards";
import { TrendChart } from "./components/TrendChart";
import { formatInteger, type DashboardPayload } from "./lib/stats";
import { useCostRate } from "./lib/use-cost-rate";

export function App({ payload }: { payload: DashboardPayload }) {
  const { summary } = payload;
  const [costRate, setCostRate] = useCostRate(payload.inputCostPerMillionTokens);

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-14 pt-8 sm:px-7 sm:pt-[42px] text-[15px] text-[#17202a]">
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <p className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#2774d9]">
            Local activity
          </p>
          <h1 className="text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.03em]">Shrinker stats</h1>
          <p className="mt-2 text-[11px] text-[#66727f]">
            Stats are stored on this machine: {summary.databasePath}
          </p>
          <p className="mb-[30px] mt-2 text-[#66727f]">Token reduction over the last 30 days</p>
        </div>
        <CostRateInput value={costRate} onChange={setCostRate} />
      </header>

      <StatCards summary={summary} costRate={costRate} />
      <SavingsHeatmap rows={summary.yearlyDaily} />
      <TrendChart daily={summary.daily} costRate={costRate} />

      <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <DataPanel
          title="By filter"
          description="Where the savings come from."
          head={["Filter", "Tokens saved", "Reduction"]}
          empty="No filter data yet."
          rows={summary.byFilter.map((row) => ({
            key: row.filterKind,
            label: row.filterKind,
            value: formatInteger(row.estimatedTokensSaved),
            note: `${row.reductionPercent}% reduction`,
          }))}
        />
        <DataPanel
          title="Top commands"
          description="Wrapped commands ranked by number of calls."
          head={["Command", "Calls", "Tokens saved"]}
          empty="No command data yet."
          rows={summary.byCommand.slice(0, 12).map((row) => ({
            key: row.command,
            label: row.command,
            value: formatInteger(row.calls),
            note: `${formatInteger(row.estimatedTokensSaved)} saved`,
          }))}
        />
        <DataPanel
          title="Coverage gaps"
          description="Uncovered commands ranked by estimated tokens a dedicated filter could see."
          head={["Command", "Est. tokens", "Calls"]}
          empty={
            summary.uncoveredTrackingEnabled
              ? "No uncovered commands recorded yet."
              : "Tracking is off. Add SHRINKER_TRACK_UNCOVERED=1 to ~/.shrinker/config to start collecting."
          }
          rows={summary.uncovered.slice(0, 12).map((row) => ({
            key: row.command,
            label: row.command,
            value: formatInteger(row.estimatedTokens),
            note: `${formatInteger(row.occurrences)} ${row.occurrences === 1 ? "call" : "calls"}`,
          }))}
        />
      </div>
    </main>
  );
}
