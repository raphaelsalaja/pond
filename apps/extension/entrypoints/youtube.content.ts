import { matches } from "@/sources/youtube/matches";
import { bridge } from "@/utils/bridge";

export default defineContentScript({
  matches,
  runAt: "document_start",
  main() {
    bridge("youtube");
  },
});
