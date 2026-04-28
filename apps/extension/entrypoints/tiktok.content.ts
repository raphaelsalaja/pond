import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches: ["https://www.tiktok.com/*"],
  runAt: "document_start",
  main() {
    bridge("tiktok");
  },
});
