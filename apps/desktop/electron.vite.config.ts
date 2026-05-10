import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@pond/schema"] })],
    resolve: {
      alias: {
        "@main": resolve(__dirname, "src/main"),
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@pond/schema"] })],
    build: {
      // The renderer's `webPreferences.sandbox` is true. Sandboxed
      // preload scripts must be CommonJS — Chromium's renderer sandbox
      // does not support ESM `import` at preload load time. Emit a
      // single `.cjs` bundle (the package's `type: "module"` would
      // otherwise force `.js` to be ESM).
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          scrape: resolve(__dirname, "src/preload/scrape.cjs.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
        // `@pond/icons` ships .ts barrel files (`fill/index.ts`,
        // `fill-duo/index.ts`, `outline/index.ts`, `social-media/index.ts`)
        // that re-export from the Nucleo packages. Aliasing the package
        // specifier to the source folder lets Vite's default extension
        // resolution pick up the barrels via subpath imports like
        // `@pond/icons/fill-duo` and `@pond/icons/types`.
        "@pond/icons": resolve(__dirname, "../../icons"),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
