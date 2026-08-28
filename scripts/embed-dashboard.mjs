import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const dashboardDist = new URL("packages/dashboard-ui/dist/", `file://${repositoryRoot}/`);
const embeddedDashboard = new URL("internal/dashboard/ui/", `file://${repositoryRoot}/`);

mkdirSync(embeddedDashboard, { recursive: true });
mkdirSync(new URL("assets/", embeddedDashboard), { recursive: true });
copyFileSync(new URL("index.html", dashboardDist), new URL("app.html", embeddedDashboard));
copyFileSync(new URL("assets/index.css", dashboardDist), new URL("assets/app.css", embeddedDashboard));
copyFileSync(new URL("assets/dashboard.js", dashboardDist), new URL("assets/dashboard.js", embeddedDashboard));
