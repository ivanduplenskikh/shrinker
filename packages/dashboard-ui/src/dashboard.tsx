import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { QuestionMarkCircledIcon } from "@radix-ui/react-icons";
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
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 rounded-full px-3 py-2"
                    aria-label="More about tokens saved over time"
                    >
                    <p className="eyebrow">Trend</p>
                    <QuestionMarkCircledIcon />
                  </Button>
                }
              />
              <TooltipContent>Tokens saved over time</TooltipContent>
            </Tooltip>
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
