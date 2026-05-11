import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

const CJS_SHIM = [
  'import __cjs_mod__ from "node:module";',
  "const __filename = import.meta.filename;",
  "const __dirname = import.meta.dirname;",
  "const require = __cjs_mod__.createRequire(import.meta.url);",
].join("\n");

const CJS_SHIM_RE =
  /\/\/ -- CommonJS Shims --\nimport __cjs_mod__.*\nconst __filename.*\nconst __dirname.*\nconst require.*\n/g;

function cjsShimPlugin(): Plugin {
  return {
    name: "pond:cjs-shim",
    apply: "build",
    enforce: "post",
    renderChunk(code: string, _chunk: unknown, options: { format: string }) {
      if (options.format !== "es") return null;
      const stripped = code.replace(CJS_SHIM_RE, "");
      if (!/(__filename|__dirname|require\()/.test(stripped)) return null;
      const lastImport = [...stripped.matchAll(/^import\s.+$/gm)].pop();
      const idx = lastImport
        ? (lastImport.index ?? 0) + lastImport[0].length
        : 0;
      return `${stripped.slice(0, idx)}\n${CJS_SHIM}\n${stripped.slice(idx)}`;
    },
  };
}

export default defineConfig({
  main: {
    plugins: [cjsShimPlugin()],
    resolve: {
      alias: {
        "@main": resolve(__dirname, "src/main"),
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    build: {
      externalizeDeps: { exclude: ["@pond/schema"] },
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
        external: ["electron", "better-sqlite3"],
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: ["@pond/schema"] },
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
        external: ["electron"],
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
