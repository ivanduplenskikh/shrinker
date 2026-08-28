import { Card, CardContent } from "@/components/ui/card";
import type { Summary } from "../types";

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

export function SummaryCards({ summary }: { summary: Summary }) {
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
    </section>
  );
}
