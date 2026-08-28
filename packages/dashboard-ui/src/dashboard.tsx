import { Badge } from "@/components/ui/dashboard-badge";
import { Card, CardContent } from "@/components/ui/card";
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
          <h1>Shrinker stats</h1>
          <p className="database-path">{summary.databasePath}</p>
        </div>
      </header>
      <SummaryCards summary={summary} />
      <Card className="panel">
        <CardContent>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Trend</p>
              <h6>Tokens saved over time</h6>
            </div>
            <Badge variant="secondary">Daily</Badge>
          </div>
          <TrendChart daily={summary.daily} />
        </CardContent>
      </Card>
      <Card className="panel">
        <CardContent>
          <div className="section-heading">
            <h2>Top commands</h2>
            <span className="database-path">Arguments omitted</span>
          </div>
          <CommandTable rows={summary.byCommand} uncovered={summary.uncovered} />
        </CardContent>
      </Card>
    </main>
  );
}
