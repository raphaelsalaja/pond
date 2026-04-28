import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches: ["https://x.com/*", "https://twitter.com/*"],
  runAt: "document_start",
  main() {
    bridge("twitter");
  },
});
