import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches: ["https://www.are.na/*", "https://are.na/*"],
  runAt: "document_start",
  main() {
    bridge("arena");
  },
});
