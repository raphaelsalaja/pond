import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches: ["https://www.cosmos.so/*", "https://cosmos.so/*"],
  runAt: "document_start",
  main() {
    bridge("cosmos");
  },
});
