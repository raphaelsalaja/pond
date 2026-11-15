import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { cssComposesHmr } from "./css-composes-hmr";

const require = createRequire(import.meta.url);
const reactDir = dirname(require.resolve("react/package.json"));
const reactDomDir = dirname(require.resolve("react-dom/package.json"));

const CJS_SHIM = [
  'import __cjs_mod__ from "node:module";',
  "const __filename = import.meta.filename;",
  "const __dirname = import.meta.dirname;",
  "const require = __cjs_mod__.createRequire(import.meta.url);",
].join("\n");

interface ChunkInfo {
  fileName: string;
}

/** Rolldown otherwise parks a vendor export in an app chunk and circular-inits (drizzle-orm `count` in library-retrieval). */
function vendorChunkName(id: string) {
  if (!id.includes("node_modules")) return null;
  const match = id.match(
    /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(@[^/]+\/[^/]+|[^/]+)/,
  );
  const pkg = match?.[1];
  if (!pkg) return null;
  return `vendor-${pkg.replace(/^@/, "").replace(/\//g, "-")}`;
}

const CJS_SHIM_RE =
  /\/\/ -- CommonJS Shims --\nimport __cjs_mod__.*\nconst __filename.*\nconst __dirname.*\nconst require.*\n/g;

function cjsShimPlugin(): Plugin {
  return {
    name: "pond:cjs-shim",
    apply: "build",
    enforce: "post",
    renderChunk(code: string, _chunk: ChunkInfo, options: { format: string }) {
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

const FONT_PRELOAD_CROSSORIGIN_RE =
  /(<link\s+rel="preload"[^>]*?as="font"[^>]*?)\s+crossorigin="anonymous"/g;

/** Chromium fetches fonts on file:// pages without CORS, so a `crossorigin` preload never matches and the font downloads twice. */
function fileFontPreloadPlugin(): Plugin {
  return {
    name: "pond:file-font-preload",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace(FONT_PRELOAD_CROSSORIGIN_RE, "$1"),
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
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          "queue-worker": resolve(
            __dirname,
            "src/main/core/pipeline/queue-worker.ts",
          ),
        },
        /** Native modules resolve their platform .node binaries at runtime; `re2` isn't built here, so external lets url-regex-safe fall back to plain RegExp. */
        external: ["electron", "better-sqlite3", "sqlite-vec", "sharp", "re2"],
        output: {
          format: "es",
          strictExecutionOrder: true,
          codeSplitting: {
            includeDependenciesRecursively: false,
            groups: [{ name: vendorChunkName }],
          },
        },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: ["@pond/schema"] },
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          "combine-images": resolve(__dirname, "src/preload/combine-images.ts"),
          "file-ring": resolve(__dirname, "src/preload/file-ring.ts"),
          preview: resolve(__dirname, "src/preload/preview.ts"),
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
    /**
     * Cross-origin isolation unlocks SharedArrayBuffer for onnxruntime-web's multi-threaded WASM; COEP `credentialless` keeps cross-origin media loading without CORP.
     * @see onHeadersReceived mirrors these in prod
     */
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "credentialless",
      },
      /** chokidar's macOS polling default pins a CPU core even when idle; FS events are reliable here. */
      watch: { usePolling: false },
      warmup: {
        clientFiles: [
          "./src/features/agent/components/pane/index.tsx",
          "./src/features/saves/components/viewers/text-viewer/index.tsx",
        ],
      },
    },
    plugins: [
      cssComposesHmr([
        resolve(__dirname, "../../packages/ui/src"),
        resolve(__dirname, "../../packages/theme/src"),
      ]),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      fileFontPreloadPlugin(),
    ],
    resolve: {
      /** Workspace packages and nested @base-ui peers otherwise pull a second React and crash Tooltip.Provider with an invalid hook call. */
      dedupe: ["react", "react-dom"],
      alias: {
        react: reactDir,
        "react-dom": reactDomDir,
        "@": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
        "@pond/icons": resolve(__dirname, "../../packages/icons"),
        "@pond/ui": resolve(__dirname, "../../packages/ui/src"),
      },
    },
    /**
     * Pre-bundle deps the crawler misses or discovers after startup (transformers subpaths, lazy Agent/editor).
     * Otherwise Vite re-optimizes mid-session and the pane's dynamic import 504s as "Failed to fetch".
     */
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@pond/ui > @base-ui/react",
        "@huggingface/transformers",
        "@ai-sdk/react",
        "ai",
        "lexical",
        "@lexical/code",
        "@lexical/link",
        "@lexical/list",
        "@lexical/mdast",
        "@lexical/rich-text",
        "@lexical/table",
        "@lexical/utils",
        "@lexical/react/LexicalComposerContext",
        "@lexical/react/LexicalContentEditable",
        "@lexical/react/LexicalExtensionComposer",
        "@lexical/react/LexicalTypeaheadMenuPlugin",
        "@lexical/react/useExtensionComponent",
        "@lexical/react/useExtensionSignalValue",
      ],
    },
    build: {
      /** Electron ships a recent Chromium; skip legacy transforms and module-preload polyfills. */
      target: "esnext",
      modulePreload: { polyfill: false },
      /** electron-vite defaults renderer `minify` to false; every window parses this code before first paint. */
      minify: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          capture: resolve(__dirname, "src/renderer/capture.html"),
          "combine-images": resolve(
            __dirname,
            "src/renderer/combine-images.html",
          ),
          "file-ring": resolve(__dirname, "src/renderer/file-ring.html"),
          preview: resolve(__dirname, "src/renderer/preview.html"),
        },
        preserveEntrySignatures: false,
        output: {
          strictExecutionOrder: true,
          codeSplitting: {
            includeDependenciesRecursively: false,
            groups: [{ name: vendorChunkName }],
          },
        },
      },
    },
  },
});
