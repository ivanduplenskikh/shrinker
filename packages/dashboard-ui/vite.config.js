import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import tailwindcss from '@tailwindcss/vite'
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  plugins: [
    react(),
    statsMiddleware(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    assetsDir: "assets",
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "assets/dashboard.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
            if (id.includes("react") || id.includes("@base-ui") || id.includes("@radix-ui")) return "vendor";
          }
        },
      }
    }
  }
});
