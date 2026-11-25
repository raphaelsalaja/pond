import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
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
  "src/renderer/src/features/library/state/folder-appearance.test.ts",
  "src/renderer/src/features/library/lib/folder-appearance-menu.test.ts",
  "src/renderer/src/features/library/components/view/empty-gallery-menu.test.ts",
  "src/renderer/src/features/library/components/new-menu/spec.test.ts",
  "src/renderer/src/features/library/components/folder-sidebar/folder-cover.test.ts",
  "src/renderer/src/features/agent/state/chat-transport.test.ts",
  "src/renderer/src/features/canvas/state/minimap.test.ts",
];

const browserTests = "src/**/*.browser.test.{ts,tsx}";

const MAC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) jsdom";

export default defineConfig({
  resolve: {
    alias: {
      electron: stub("electron.ts"),
      "electron-log/main.js": stub("electron-log.ts"),
      /** Without Electron, the renderer logger stalls the jsdom worker forever. */
      "electron-log/renderer": stub("electron-log.ts"),
      "@": fileURLToPath(new URL("./src/renderer/src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@pond/render": fileURLToPath(
        new URL("../../packages/render/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          exclude: [...rendererTypeScriptTests, browserTests],
          environment: "node",
        },
      },
      {
        test: {
          name: "renderer",
          include: ["src/**/*.test.tsx", ...rendererTypeScriptTests],
          exclude: [browserTests],
          environment: "jsdom",
          /** Pond ships only on macOS; a Mac user agent keeps `Mod` as ⌘ where jsdom would otherwise read as Linux. */
          environmentOptions: { jsdom: { userAgent: MAC_USER_AGENT } },
          setupFiles: ["./test/renderer-setup.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: [browserTests],
          setupFiles: ["./test/browser-setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            /** Headless Chromium otherwise denies `navigator.clipboard`. */
            provider: playwright({
              contextOptions: {
                permissions: ["clipboard-read", "clipboard-write"],
              },
            }),
            instances: [{ browser: "chromium" }],
            viewport: { width: 1280, height: 800 },
          },
        },
      },
    ],
  },
});
