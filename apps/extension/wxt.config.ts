import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: {
    disabled: true,
  },
  manifest: {
    name: "Pond",
    version: "0.1.0",
    description:
      "Capture saves from Twitter/X, Instagram, Pinterest, Are.na, Cosmos, TikTok, YouTube, and web articles into one place.",
    permissions: ["storage", "scripting", "contextMenus", "activeTab", "tabs"],
    host_permissions: [
      "https://x.com/*",
      "https://twitter.com/*",
      "https://www.instagram.com/*",
      "https://www.pinterest.com/*",
      "https://*.pinterest.com/*",
      "https://www.are.na/*",
      "https://are.na/*",
      "https://www.cosmos.so/*",
      "https://cosmos.so/*",
      "https://www.tiktok.com/*",
      "https://www.youtube.com/*",
      "https://m.youtube.com/*",
      "http://127.0.0.1/*",
      "http://localhost/*",
      "<all_urls>",
    ],
  },
});
