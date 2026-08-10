import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const stub = (p: string) =>
  fileURLToPath(new URL(`./test/stubs/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      /** The extractor graph touches Electron only at runtime; stubs let modules import in a plain Node test process. */
      electron: stub("electron.ts"),
      "electron-log/main.js": stub("electron-log.ts"),
      /** Renderer path alias so renderer modules import under test the same way they do in the app. */
      "@": fileURLToPath(new URL("./src/renderer/src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
