import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { CommandTable } from "./components/CommandTable";
import { SummaryCards } from "./components/SummaryCards";
import { CommandRunChart, type TimelineRange } from "./components/TrendChart";
import type { Summary } from "./types";
import "./styles.css";

export function Dashboard({ summary }: { summary: Summary }) {
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
  const [range, setRange] = useState<TimelineRange>("day");
  const selectedRuns = selectedCommand === null ? summary.commandRuns : summary.commandRuns.filter((run) => run.command === selectedCommand);
  const commands = [...new Set(summary.commandRuns.map((run) => run.command))].sort();

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <h1>Shrinker stats</h1>
          <p className="database-path">From: {summary.databasePath}</p>
        </div>
      </header>
      <SummaryCards summary={summary} />
      <Card className="panel">
        <CardContent>
          <div className="section-heading">
            <div><p className="eyebrow">Run history</p><h2>{selectedCommand ?? "All commands"}</h2></div>
            <div className="chart-controls">
              <label>Command<select value={selectedCommand ?? ""} onChange={(event) => setSelectedCommand(event.target.value || null)}><option value="">All commands</option>{commands.map((command) => <option key={command} value={command}>{command}</option>)}</select></label>
              <label>Range<select value={range} onChange={(event) => setRange(event.target.value as TimelineRange)}><option value="day">Today</option><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option></select></label>
            </div>
          </div>
          <CommandRunChart runs={selectedRuns} range={range} />
        </CardContent>
      </Card>
      <Card className="panel">
        <CardContent>
          <div className="section-heading">
            <h2>Top commands</h2>
            <span className="database-path">Arguments omitted</span>
          </div>
          <CommandTable rows={summary.byCommand} uncovered={summary.uncovered} selectedCommand={selectedCommand} onSelectCommand={setSelectedCommand} />
        </CardContent>
      </Card>
    </main>
  );
}
