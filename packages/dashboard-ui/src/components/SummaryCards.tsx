import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";
import type { Summary } from "../types";

const AVERAGE_INPUT_COST_PER_MILLION = (10 + 4 + 2 + 2) / 4;

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function SummaryCards({ summary }: { summary: Summary }) {
  const averageSavedCost = summary.total.estimatedTokensSaved * AVERAGE_INPUT_COST_PER_MILLION / 1_000_000;

  return (
    <section className="summary-grid" aria-label="Summary">
      <Card>
        <CardContent>
          <span className="stat-label">Runs</span>
          <strong>{formatNumber(summary.total.runs)}</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <span className="stat-label">Tokens saved</span>
          <strong>{formatNumber(summary.total.estimatedTokensSaved)}</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <span className="stat-label">Reduction</span>
          <strong>{summary.total.reductionPercent || 0}%</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <span className="stat-label">Last 7 days</span>
          <strong>{formatNumber(summary.last7Days.estimatedTokensSaved)}</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div className="stat-label-with-help">
            <span className="stat-label">Average saved cost</span>
            <Tooltip>
              <TooltipTrigger render={<Button aria-label="How average saved cost is calculated" size="icon-xs" type="button" variant="ghost"><CircleHelp /></Button>} />
              <TooltipContent>Saved input tokens × the average standard input rate ($4.50 per million tokens).</TooltipContent>
            </Tooltip>
          </div>
          <strong>{formatCurrency(averageSavedCost)}</strong>
        </CardContent>
      </Card>
    </section>
  );
}
