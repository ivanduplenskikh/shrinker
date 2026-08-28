import { Card } from "@heroui/react";
import type { Summary } from "../types";

function formatNumber(value = 0): string {
  return Number(value).toLocaleString();
}

export function SummaryCards({ summary }: { summary: Summary }) {
  return (
    <section className="summary-grid" aria-label="Summary">
      <Card>
        <Card.Content>
          <span className="stat-label">Runs</span>
          <strong>{formatNumber(summary.total.runs)}</strong>
        </Card.Content>
      </Card>
      <Card>
        <Card.Content>
          <span className="stat-label">Tokens saved</span>
          <strong>{formatNumber(summary.total.estimatedTokensSaved)}</strong>
        </Card.Content>
      </Card>
      <Card>
        <Card.Content>
          <span className="stat-label">Reduction</span>
          <strong>{summary.total.reductionPercent || 0}%</strong>
        </Card.Content>
      </Card>
      <Card>
        <Card.Content>
          <span className="stat-label">Last 7 days</span>
          <strong>{formatNumber(summary.last7Days.estimatedTokensSaved)}</strong>
        </Card.Content>
      </Card>
    </section>
  );
}
