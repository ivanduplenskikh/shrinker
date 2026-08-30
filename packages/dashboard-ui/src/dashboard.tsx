import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { CommandTable } from "./components/CommandTable";
import { SummaryCards } from "./components/SummaryCards";
import { CommandRunChart, TrendChart } from "./components/TrendChart";
import type { Summary } from "./types";
import "./styles.css";

export function Dashboard({ summary }: { summary: Summary }) {
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
  const selectedRuns = selectedCommand === null
    ? []
    : summary.commandRuns.filter((run) => run.command === selectedCommand);

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
            {selectedCommand === null ? (
              <Tooltip>
                <TooltipTrigger render={<Button type="button" variant="outline" className="gap-2 rounded-full px-3 py-2" aria-label="More about tokens saved over time"><p className="eyebrow">Trend</p><QuestionMarkCircledIcon /></Button>} />
                <TooltipContent>Tokens saved over time</TooltipContent>
              </Tooltip>
            ) : <><div><p className="eyebrow">Run history</p><h2>{selectedCommand}</h2></div><Button type="button" variant="outline" onClick={() => setSelectedCommand(null)}>All commands</Button></>}
          </div>
          {selectedCommand === null ? <TrendChart daily={summary.daily} /> : <CommandRunChart runs={selectedRuns} />}
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
