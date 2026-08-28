import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    assetsDir: "assets",
    rollupOptions: {
      input: "app.html",
      output: {
        inlineDynamicImports: true,
        entryFileNames: "assets/dashboard.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
