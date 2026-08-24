import { execFile, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import { getInputCostPerMillionTokens, type StatsSummary } from "./stats-store.js";
import { DASHBOARD_STATS_PLACEHOLDER, DASHBOARD_TEMPLATE_HTML } from "./dashboard-template.generated.js";

const execFileAsync = promisify(execFile);

// Identifies a running server as ours without depending on user-visible copy.
const DASHBOARD_MARKER = 'name="generator" content="shrinker-dashboard"';

// Neutralizes `</script>` inside string fields so the payload cannot break out of the JSON block.
function serializePayload(summary: StatsSummary): string {
  const payload = {
    summary,
    inputCostPerMillionTokens: getInputCostPerMillionTokens(),
  };
  return JSON.stringify(payload).replaceAll("<", "\\u003c");
}

export function defaultDashboardPath(databasePath: string): string {
  return path.join(path.dirname(databasePath), "dashboard.html");
}

export function renderStatsDashboard(summary: StatsSummary): string {
  const json = serializePayload(summary);
  return DASHBOARD_TEMPLATE_HTML.replace(DASHBOARD_STATS_PLACEHOLDER, () => json);
}

export function writeStatsDashboard(summary: StatsSummary, outputPath = defaultDashboardPath(summary.databasePath)): string {
  mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  writeFileSync(outputPath, renderStatsDashboard(summary), "utf8");
  return outputPath;
}

export function openStatsDashboard(outputPath: string): void {
  const platform = process.platform;
  if (platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", outputPath], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }

  const command = platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [outputPath], { detached: true, stdio: "ignore" });
  child.unref();
}

export function serveStatsDashboard(getSummary: () => StatsSummary, port = 4317): Promise<void> {
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/__shrinker_shutdown") {
      response.writeHead(204);
      response.end(() => server.close());
      return;
    }

    if (request.url !== "/") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    try {
      const html = renderStatsDashboard(getSummary());
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Could not render dashboard: ${String(error)}`);
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}`;
      process.stdout.write(`Dashboard server running at ${url}\n`);
      openStatsDashboard(url);
      resolve();
    });
  });
}

async function isShrinkerDashboard(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return false;
    const body = await response.text();
    return body.includes(DASHBOARD_MARKER) || body.includes("Shrinker stats");
  } catch {
    return false;
  }
}

async function findListeningProcessId(port: number): Promise<number | undefined> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"]);
      const match = stdout
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .find((columns) => columns[1]?.endsWith(`:${port}`) && columns[3] === "LISTENING");
      const processId = Number(match?.[4]);
      return Number.isInteger(processId) && processId > 0 ? processId : undefined;
    }

    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    const processId = Number(stdout.trim().split(/\s+/)[0]);
    return Number.isInteger(processId) && processId > 0 ? processId : undefined;
  } catch {
    return undefined;
  }
}

async function stopLegacyDashboardServer(port: number, url: string): Promise<boolean> {
  if (!(await isShrinkerDashboard(url))) return false;
  const processId = await findListeningProcessId(port);
  if (!processId) return false;

  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(processId), "/F"]);
    } else {
      process.kill(processId, "SIGTERM");
    }
    return true;
  } catch {
    return false;
  }
}

export async function startStatsDashboard(port = 4317, restart = false): Promise<{ pid: number; reused: boolean; restarted: boolean }> {
  const url = `http://127.0.0.1:${port}`;
  let restarted = false;
  if (restart) {
    let response: Response | undefined;
    try {
      response = await fetch(`${url}/__shrinker_shutdown`, {
        method: "POST",
        signal: AbortSignal.timeout(500),
      });
    } catch {}
    if (response && !response.ok) {
      restarted = await stopLegacyDashboardServer(port, url);
      if (!restarted) throw new Error(`Could not restart dashboard server at ${url}`);
    } else {
      restarted = response?.ok ?? false;
    }
  }

  if (await isShrinkerDashboard(url)) {
    openStatsDashboard(url);
    return { pid: 0, reused: true, restarted: false };
  }

  const child = spawn(
    process.execPath,
    [process.argv[1] ?? "", "stats", "--dashboard", "--dashboard-server", "--port", String(port)],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return { pid: child.pid ?? 0, reused: false, restarted };
}
