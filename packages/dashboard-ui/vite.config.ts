import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { shrinkerDevStats } from "./plugins/dev-stats";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), shrinkerDevStats()],
  base: "./",
  // Installers set this; warnings and errors still surface.
  logLevel: process.env['SHRINKER_BUILD_QUIET'] ? "warn" : "info",
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4096,
  },
});
