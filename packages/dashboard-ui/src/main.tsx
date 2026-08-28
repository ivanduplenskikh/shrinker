import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Dashboard } from "./dashboard";
import type { StatsPayload, Summary } from "./types";

const root = document.getElementById("root");
if (!root) throw new Error("Dashboard root element is missing");
declare global {
  interface Window {
    __SHRINKER_STATS__?: StatsPayload;
  }
}

const emptySummary: Summary = {
  databasePath: "",
  total: { runs: 0, estimatedTokensSaved: 0, reductionPercent: 0 },
  last7Days: { estimatedTokensSaved: 0 },
  daily: [],
  byCommand: [],
  uncovered: [],
};

function App() {
  const [summary, setSummary] = useState<Summary>(
    window.__SHRINKER_STATS__?.summary ?? emptySummary,
  );

  useEffect(() => {
    if (window.__SHRINKER_STATS__) return;
    fetch("/api/stats")
      .then((response) => {
        if (!response.ok) throw new Error(`Stats request failed: ${response.status}`);
        return response.json() as Promise<StatsPayload>;
      })
      .then((payload) => setSummary(payload.summary))
      .catch((error: unknown) => console.error(error));
  }, []);

  return <Dashboard summary={summary} />;
}

createRoot(root).render(<App />);
