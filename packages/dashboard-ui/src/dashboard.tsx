import { Card, Chip } from "@heroui/react";
import { CommandTable } from "./components/CommandTable";
import { SummaryCards } from "./components/SummaryCards";
import { TrendChart } from "./components/TrendChart";
import type { Summary } from "./types";
import "./styles.css";

export function Dashboard({ summary }: { summary: Summary }) {
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Local activity</p>
          <h1>Shrinker stats</h1>
          <p className="database-path">{summary.databasePath}</p>
        </div>
      </header>
      <SummaryCards summary={summary} />
      <Card className="panel">
        <Card.Content>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Trend</p>
              <h2>Tokens saved over time</h2>
            </div>
            <Chip variant="secondary">Daily</Chip>
          </div>
          <TrendChart daily={summary.daily} />
        </Card.Content>
      </Card>
      <Card className="panel">
        <Card.Content>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Command coverage</p>
              <h2>Top commands</h2>
            </div>
            <span className="database-path">Arguments omitted</span>
          </div>
          <CommandTable
            rows={summary.byCommand}
            uncovered={summary.uncovered}
            observedReductionPercent={summary.total.reductionPercent}
          />
        </Card.Content>
      </Card>
    </main>
  );
}
