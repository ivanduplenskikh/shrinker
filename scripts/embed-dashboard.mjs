import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("internal/dashboard/ui/assets", { recursive: true });
copyFileSync("packages/dashboard-ui/dist/index.html", "internal/dashboard/ui/app.html");
copyFileSync("packages/dashboard-ui/dist/assets/index.css", "internal/dashboard/ui/assets/app.css");
copyFileSync("packages/dashboard-ui/dist/assets/dashboard.js", "internal/dashboard/ui/assets/dashboard.js");
