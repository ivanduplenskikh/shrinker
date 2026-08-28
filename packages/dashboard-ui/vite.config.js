import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

function statsMiddleware() {
  return {
    name: "shrinker-stats-middleware",
    configureServer(server) {
      server.middlewares.use("/api/stats", (_request, response) => {
        const result = spawnSync("go", ["run", "./cmd/shrinker", "stats", "--json"], {
          cwd: repositoryRoot,
          encoding: "utf8"
        });
        if (result.error || result.status !== 0) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: result.stderr || result.error?.message || "Unable to read stats" }));
          return;
        }
        const summary = JSON.parse(result.stdout);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ summary }));
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), statsMiddleware()],
  build: {
    assetsDir: "assets",
    rollupOptions: {
      input: "index.html",
      output: {
        inlineDynamicImports: true,
        entryFileNames: "assets/dashboard.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
