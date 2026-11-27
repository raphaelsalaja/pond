import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * One classic script and one stylesheet. Chromium refuses module scripts on `file://`
 * pages, and an exported Share Page has to open straight from disk.
 */
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    target: "es2022",
    cssCodeSplit: false,
    reportCompressedSize: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/main.tsx"),
      formats: ["iife"],
      name: "PondSharePage",
      fileName: () => "viewer.js",
      cssFileName: "viewer",
    },
  },
});
