import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  runAt: "document_start",
  main() {
    bridge("instagram");
  },
});
