import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger, Plugin } from "vite";

const PLACEHOLDER = "__SHRINKER_STATS_JSON__";

interface StatsModule {
  getStats: (databasePath?: string) => unknown;
  defaultStatsPath: () => string;
  getInputCostPerMillionTokens: () => number;
}

// Dev only: in production the CLI substitutes this placeholder, but it never runs under `vite dev`.
export function shrinkerDevStats(): Plugin {
  const repoRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)), "../..");
  const statsModulePath = path.join(repoRoot, "dist", "src", "metrics", "stats-store.js");
  let logger: Logger | undefined;
  let warned = false;

  return {
    name: "shrinker-dev-stats",
    apply: "serve",
    configResolved(config) {
      logger = config.logger;
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        try {
          // Cache-bust so a rebuilt CLI or an updated database is picked up on reload.
          const stats: StatsModule = await import(`file://${statsModulePath}?t=${Date.now()}`);
          const payload = JSON.stringify({
            summary: stats.getStats(stats.defaultStatsPath()),
            inputCostPerMillionTokens: stats.getInputCostPerMillionTokens(),
          });
          return html.replace(PLACEHOLDER, () => payload.replaceAll("<", "\\u003c"));
        } catch (error) {
          if (!warned) {
            warned = true;
            logger?.warn(
              `[shrinker-dev-stats] Using empty data. Run \`npm run build\` once so dist/ exists. ${String(error)}`,
            );
          }
          return html;
        }
      },
    },
  };
}
