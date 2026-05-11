import { matches } from "@/sources/pinterest/matches";
import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches,
  runAt: "document_start",
  main() {
    bridge("pinterest");
  },
});
