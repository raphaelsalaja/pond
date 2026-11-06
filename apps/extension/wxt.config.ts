import { resolve } from "node:path";
import { EXTENSION_KEY, FIREFOX_EXTENSION_ID } from "@pond/schema/native";
import { defineConfig } from "wxt";

const STORE_BUILD = process.env.POND_STORE_BUILD === "1";

const ICONS = {
  16: "icons/16.png",
  32: "icons/32.png",
  48: "icons/48.png",
  128: "icons/128.png",
};

const FONT_RESOURCE = {
  resources: ["fonts/inter/variable.woff2"],
  matches: ["<all_urls>"],
};

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  /** Pin to 3001 with strictPort so dev never collides with the website's Next server. */
  dev: {
    server: {
      port: 3001,
      strictPort: true,
      origin: "http://localhost:3001",
    },
  },
  webExt: {
    disabled: true,
  },
  vite: () => ({
    resolve: {
      alias: {
        "@pond/ui": resolve(__dirname, "../../packages/ui/src"),
      },
    },
  }),
  zip: {
    artifactTemplate: "pond-extension-{{version}}-{{browser}}.zip",
    sourcesTemplate: "pond-extension-{{version}}-sources.zip",
    /** AMO reviewers rebuild from source, so the zip carries the workspace packages the extension imports. */
    sourcesRoot: resolve(__dirname, "../.."),
    includeSources: [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
      ".nvmrc",
      "LICENSE",
      "apps/extension/**",
      "packages/icons/**",
      "packages/schema/**",
      "packages/theme/**",
      "packages/ui/**",
    ],
    excludeSources: ["packages/icons/brand/**"],
  },
  manifest: ({ browser }) => ({
    name: "Pond",
    version: "2.3.1",
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: FIREFOX_EXTENSION_ID,
              strict_min_version: "140.0",
              data_collection_permissions: {
                required: [
                  "authenticationInfo",
                  "browsingActivity",
                  "websiteActivity",
                  "websiteContent",
                ],
              },
            },
          },
        }
      : browser === "safari"
        ? /** `world: "MAIN"` hooks need Safari 18. */
          {
            browser_specific_settings: {
              safari: { strict_min_version: "18.0" },
            },
          }
        : STORE_BUILD
          ? {}
          : { key: EXTENSION_KEY }),
    description:
      "Save pages, screenshots, images, and your bookmarks from X, Instagram, Pinterest, and more into your local Pond library.",
    icons: ICONS,
    action: {
      default_title: "Pond",
      default_icon: ICONS,
    },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+P" },
        description: "Open Pond",
      },
      "save-page": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "Save the current page",
      },
      "save-images": {
        suggested_key: { default: "Alt+Shift+I" },
        description: "Save images from the page",
      },
      "screenshot-region": {
        suggested_key: { default: "Alt+Shift+R" },
        description: "Capture a region of the page",
      },
      "screenshot-visible": {
        description: "Capture the visible area",
      },
      "screenshot-full": {
        description: "Capture the full page",
      },
    },
    permissions: [
      "storage",
      "activeTab",
      "scripting",
      "tabs",
      "cookies",
      "contextMenus",
      "nativeMessaging",
      "alarms",
    ],
    host_permissions: ["<all_urls>"],
    /** The overlay registers Inter on the page; a per-session URL keeps sites from probing for the extension. */
    web_accessible_resources: [
      browser === "firefox"
        ? FONT_RESOURCE
        : { ...FONT_RESOURCE, use_dynamic_url: true },
    ],
  }),
});
