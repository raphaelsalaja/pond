import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches: ["https://www.pinterest.com/*", "https://*.pinterest.com/*"],
  runAt: "document_start",
  main() {
    bridge("pinterest");
  },
});
