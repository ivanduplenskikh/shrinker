import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const dashboardDist = new URL("packages/dashboard-ui/dist/", `file://${repositoryRoot}/`);
const embeddedDashboard = new URL("internal/dashboard/ui/", `file://${repositoryRoot}/`);

mkdirSync(embeddedDashboard, { recursive: true });
copyFileSync(new URL("index.html", dashboardDist), new URL("app.html", embeddedDashboard));
const embeddedAssets = new URL("assets/", embeddedDashboard);
rmSync(embeddedAssets, { recursive: true, force: true });
cpSync(new URL("assets/", dashboardDist), embeddedAssets, { recursive: true });
