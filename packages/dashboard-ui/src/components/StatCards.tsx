import { Card, CardBody } from "@heroui/react";
import { formatInteger, formatUsd, type StatsSummary } from "../lib/stats";

interface StatCardsProps {
  summary: StatsSummary;
  costRate: number;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card shadow="sm" radius="sm" className="border border-[#dce3e8] bg-white">
      <CardBody className="px-5 py-[18px]">
        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#66727f]">
          {label}
        </span>
        <strong className="mt-1.5 block text-[27px] font-bold leading-tight text-[#17202a]">
          {value}
        </strong>
      </CardBody>
    </Card>
  );
}

export function StatCards({ summary, costRate }: StatCardsProps) {
  const totalCostSaved = (summary.total.estimatedTokensSaved / 1_000_000) * costRate;
  const averageCostSaved = summary.total.runs === 0 ? 0 : totalCostSaved / summary.total.runs;

  return (
    <section className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="All-time saved" value={formatInteger(summary.total.estimatedTokensSaved)} />
      <StatCard label="Estimated API cost saved" value={formatUsd(totalCostSaved)} />
      <StatCard label="Average saved per run" value={formatUsd(averageCostSaved)} />
      <StatCard label="Runs this week" value={formatInteger(summary.last7Days.runs)} />
      <StatCard label="Average reduction" value={`${summary.total.reductionPercent}%`} />
    </section>
  );
}
