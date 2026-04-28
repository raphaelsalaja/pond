import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  runAt: "document_start",
  main() {
    bridge("youtube");
  },
});
