import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const stub = (p: string) =>
  fileURLToPath(new URL(`./test/stubs/${p}`, import.meta.url));

const rendererTypeScriptTests = [
  "src/renderer/src/shared/lib/editable-target.test.ts",
  "src/renderer/src/shared/lib/paint-theme.test.ts",
  "src/renderer/src/shared/lib/settled-resize.test.ts",
  "src/renderer/src/shared/hooks/use-scroll-restoration.test.ts",
  "src/renderer/src/features/saves/lib/eagle-baseline-menu.test.ts",
  "src/renderer/src/features/saves/lib/menu.test.ts",
  "src/renderer/src/features/saves/lib/preview-step.test.ts",
  "src/renderer/src/features/saves/lib/select.test.ts",
  "src/renderer/src/features/saves/lib/selection.test.ts",
  "src/renderer/src/features/saves/lib/viewer-memory.test.ts",
  "src/renderer/src/features/saves/components/viewers/safe-web-viewer/sanitize.test.ts",
  "src/renderer/src/features/library/state/library-chrome.test.ts",
  "src/renderer/src/features/library/state/saved-views.test.ts",
  "src/renderer/src/features/library/state/view-store.test.ts",
  "src/renderer/src/features/library/lib/library-layout-transition.test.ts",
  "src/renderer/src/features/library/components/view/empty-gallery-menu.test.ts",
  "src/renderer/src/features/library/components/new-menu/spec.test.ts",
  "src/renderer/src/features/library/components/folder-sidebar/folder-cover.test.ts",
  "src/renderer/src/features/agent/state/chat-transport.test.ts",
  "src/renderer/src/features/canvas/state/minimap.test.ts",
];

export default defineConfig({
  resolve: {
    alias: {
      electron: stub("electron.ts"),
      "electron-log/main.js": stub("electron-log.ts"),
      "@": fileURLToPath(new URL("./src/renderer/src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          exclude: rendererTypeScriptTests,
          environment: "node",
        },
      },
      {
        test: {
          name: "renderer",
          include: ["src/**/*.test.tsx", ...rendererTypeScriptTests],
          environment: "jsdom",
          setupFiles: ["./test/renderer-setup.ts"],
          // The first jsdom test in a file pays for a cold module graph; the
          // Windows runner is roughly four times slower than Linux.
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
    ],
  },
});
